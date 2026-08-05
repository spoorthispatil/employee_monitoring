import { EventEmitter } from 'events';

export type AppEventName =
  | 'batch.ready_at_mill'
  | 'shipment.delivered'
  | 'port.hour_7_warning'
  | 'port.hour_8_overtime'
  | 'quote.accepted'
  | 'po.approved'
  | 'escrow.signed'
  | 'sgs.result'
  | 'performance.poor_flag'
  | 'employee.inactive_3days'
  | 'document.expiring_soon';

class AppEventBus extends EventEmitter {
  emit(event: string, ...args: any[]): boolean {
    console.log(`[Event] ${event}`);
    return super.emit(event, ...args);
  }
}

export const eventBus = new AppEventBus();
eventBus.setMaxListeners(50);

export async function registerEventHandlers() {
  const { sendAlert } = await import('../utils/alerts');
  const { getModuleRecipients, getEmployeeEmail } = await import('../utils/recipients');

  eventBus.on('batch.ready_at_mill', async (p: any) => {
    console.log('[Handler] batch.ready_at_mill ->', p.batch_id);
    const recipients = await getModuleRecipients('logistics').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'info', recipient_email: email,
      subject: `Batch ${p.batch_id} ready at mill`,
      body: `Batch ${p.batch_id} (PO ${p.po_id ?? 'n/a'}) is ready at the mill and needs a shipment scheduled.`,
    })));
  });

  eventBus.on('shipment.delivered', async (p: any) => {
    const { query } = await import('../../db/pool');
    if (p.escrow_id) {
      await query(
        `UPDATE escrows SET status='delivery_confirmed', delivery_confirmed_at=NOW() WHERE id=$1`,
        [p.escrow_id]
      ).catch(() => {});
    }
    console.log('[Handler] shipment.delivered ->', p.shipment_id);
    const recipients = await getModuleRecipients('finance').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'success', recipient_email: email,
      subject: `Shipment ${p.shipment_id} delivered`,
      body: `Shipment ${p.shipment_id} has been marked delivered. Escrow ${p.escrow_id ?? 'n/a'} is now awaiting client sign-off.`,
    })));
  });

  eventBus.on('escrow.signed', async (p: any) => {
    const { query } = await import('../../db/pool');
    await query(
      `UPDATE commissions SET status='earned', earned_at=NOW() WHERE escrow_id=$1 AND status='pending_escrow'`,
      [p.escrow_id]
    ).catch(() => {});
    console.log('[Handler] escrow.signed ->', p.escrow_id);
    const recipients = await getModuleRecipients('sales').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'success', recipient_email: email,
      subject: `Escrow ${p.escrow_id} signed — commissions released`,
      body: `Escrow ${p.escrow_id} (value ${p.value ?? 'n/a'}) has been signed. Related commissions are now marked earned.`,
    })));
  });

  eventBus.on('quote.accepted', async (p: any) => {
    console.log('[Handler] quote.accepted ->', p.quote_id);
    const recipients = await getModuleRecipients('procurement').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'info', recipient_email: email,
      subject: `Quote ${p.quote_id} accepted`,
      body: `A client accepted quote ${p.quote_id}. Procurement should raise a PO to fulfil it.`,
    })));
  });

  eventBus.on('po.approved', async (p: any) => {
    const { query } = await import('../../db/pool');
    await query(
      `INSERT INTO sourcing_requests (po_id, status) VALUES ($1,'sent_to_partner')`,
      [p.po_id]
    ).catch(() => {});
    console.log('[Handler] po.approved ->', p.po_id);
    const recipients = await getModuleRecipients('manufacturing').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'info', recipient_email: email,
      subject: `PO approved — sourcing needed`,
      body: `PO ${p.po_id} for ${p.quantity ?? '?'} tonnes of ${p.steel_grade ?? 'steel'} was approved and sent to sourcing.`,
    })));
  });

  eventBus.on('sgs.result', async (p: any) => {
    if (p.result === 'fail') {
      const { query } = await import('../../db/pool');
      await query(
        `UPDATE batches SET sgs_status='fail', status='sgs_failed' WHERE id=$1`,
        [p.batch_id]
      ).catch(() => {});
    }
    console.log('[Handler] sgs.result ->', p.result);
    const recipients = await getModuleRecipients('manufacturing').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: p.result === 'fail' ? 'danger' : p.result === 'conditional_pass' ? 'warning' : 'success',
      recipient_email: email,
      subject: `SGS inspection ${p.result} — batch ${p.batch_id}`,
      body: p.result === 'fail'
        ? `Batch ${p.batch_id} FAILED SGS inspection. Re-sourcing may be required.`
        : `Batch ${p.batch_id} SGS inspection result: ${p.result}.`,
    })));
  });

  eventBus.on('performance.poor_flag', async (p: any) => {
    console.log('[Handler] performance.poor_flag ->', p.employee_id);
    const recipients = await getModuleRecipients(p.module || 'hr').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'warning', recipient_email: email,
      subject: `Employee flagged: 2 consecutive poor weeks`,
      body: `Employee ${p.employee_id} has scored "poor" in ${p.module} for ${p.consecutive_weeks} consecutive weeks. A check-in or warning may be warranted.`,
    })));
  });

  eventBus.on('employee.inactive_3days', async (p: any) => {
    console.log('[Handler] employee.inactive_3days ->', p.employee_id);
    const recipients = await getModuleRecipients('hr').catch(() => []);
    const empEmail = await getEmployeeEmail(p.employee_id).catch(() => null);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'warning', recipient_email: email,
      subject: `Employee inactive 3+ days`,
      body: `${empEmail ?? p.employee_id} has had no activity since ${p.last_active}. Please confirm whether they're on approved leave.`,
    })));
  });

  eventBus.on('document.expiring_soon', async (p: any) => {
    console.log('[Handler] document.expiring_soon ->', p.document_id);
    const recipients = await getModuleRecipients('paperwork').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: p.days_left <= 7 ? 'danger' : 'warning', recipient_email: email,
      subject: `Document expiring in ${p.days_left} day(s)`,
      body: `A ${p.doc_type} document expires on ${p.expiry_date} (${p.days_left} day(s) left). Please renew.`,
    })));
  });

  eventBus.on('port.hour_7_warning', async (p: any) => {
    console.log('[Handler] port.hour_7_warning ->', p.port_charge_id);
    const recipients = await getModuleRecipients('logistics').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'warning', recipient_email: email,
      subject: `Port charge approaching overtime`,
      body: `Port charge ${p.port_charge_id} for shipment ${p.shipment_id} has been running ${p.hours_elapsed}h — overtime billing starts at 8h.`,
    })));
  });

  eventBus.on('port.hour_8_overtime', async (p: any) => {
    console.log('[Handler] port.hour_8_overtime ->', p.port_charge_id);
    const recipients = await getModuleRecipients('finance').catch(() => []);
    await Promise.all(recipients.map(email => sendAlert({
      type: 'danger', recipient_email: email,
      subject: `Port charge hit overtime`,
      body: `Port charge ${p.port_charge_id} for shipment ${p.shipment_id} logged ${p.hours} hours at rate ${p.rate}/hr — overtime now applies.`,
    })));
  });

  console.log('[Events] All handlers registered');
}
