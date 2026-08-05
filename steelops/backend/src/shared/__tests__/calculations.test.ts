import { computeSalesScore, computeCommission, computeDDUInsurance, computePortCharge } from '../calculations';

describe('computeSalesScore', () => {
  it('gives 0 for a contractor with no activity', () => {
    expect(computeSalesScore(0, 0)).toEqual({ score: 0, tier: 'poor' });
  });

  it('caps the volume component at 20 contacts', () => {
    const at20 = computeSalesScore(20, 0);
    const at40 = computeSalesScore(40, 0);
    expect(at20.score).toBe(60);
    expect(at40.score).toBe(60); // no extra credit past 20 contacts with 0 closes
  });

  it('rewards conversion rate on top of volume', () => {
    // 20 contacts (60 pts) + 100% conversion (40 pts) = 100
    expect(computeSalesScore(20, 20)).toEqual({ score: 100, tier: 'top' });
  });

  it('assigns tiers at the documented thresholds', () => {
    expect(computeSalesScore(20, 20).tier).toBe('top');   // 100 >= 80
    expect(computeSalesScore(20, 3).tier).toBe('mid');    // 60 + 6 = 66, in [50,80)
    expect(computeSalesScore(5, 0).tier).toBe('poor');    // 15 < 50
  });

  it('rounds to one decimal place', () => {
    const { score } = computeSalesScore(7, 2);
    expect(Number.isInteger(score * 10)).toBe(true);
  });
});

describe('computeCommission', () => {
  it('is 2% of quantity * price', () => {
    expect(computeCommission(100, 500)).toBeCloseTo(1000, 5); // 100*500*0.02
  });

  it('is zero for a zero-quantity quote', () => {
    expect(computeCommission(0, 500)).toBe(0);
  });
});

describe('computeDDUInsurance', () => {
  it('is 1% of quantity * price', () => {
    expect(computeDDUInsurance(250, 680)).toBeCloseTo(1700, 5);
  });
});

describe('computePortCharge', () => {
  it('has no overtime under 8 hours', () => {
    const { overtimeHours } = computePortCharge(6, 100);
    expect(overtimeHours).toBe(0);
  });

  it('flags overtime past 8 hours', () => {
    const { overtimeHours, totalCharge } = computePortCharge(9.5, 100);
    expect(overtimeHours).toBeCloseTo(1.5, 5);
    expect(totalCharge).toBeCloseTo(950, 5);
  });

  it('bills the full duration regardless of overtime', () => {
    const { totalCharge } = computePortCharge(3, 50);
    expect(totalCharge).toBe(150);
  });
});
