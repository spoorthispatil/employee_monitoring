import { query } from '../../db/pool';
import { eventBus } from '../events/bus';

// Runs every 15 min. Any port charge still open (no unload_end) that has crossed
// 7 hours gets a one-time warning event before overtime kicks in at hour 8.
// `port.hour_8_overtime` (elsewhere) already fires once at close-time, but this
// is the earlier heads-up so a foreman can react before overtime is billed.
export async function runPortHourWarningCheck(): Promise<void> {
  const rows = await query<any>(
    `SELECT id, shipment_id, rate_per_hour,
            EXTRACT(EPOCH FROM (NOW() - unload_start)) / 3600.0 AS hours_elapsed
     FROM port_charges
     WHERE unload_end IS NULL
       AND warned_hour7 = FALSE
       AND EXTRACT(EPOCH FROM (NOW() - unload_start)) / 3600.0 >= 7`
  );
  for (const row of rows) {
    eventBus.emit('port.hour_7_warning', {
      port_charge_id: row.id,
      shipment_id: row.shipment_id,
      hours_elapsed: Number(row.hours_elapsed.toFixed(2)),
      rate: row.rate_per_hour,
    });
    await query(`UPDATE port_charges SET warned_hour7 = TRUE WHERE id = $1`, [row.id]);
  }
  if (rows.length) console.log(`[PortMonitor] ${rows.length} charge(s) crossed the 7-hour mark`);
}
