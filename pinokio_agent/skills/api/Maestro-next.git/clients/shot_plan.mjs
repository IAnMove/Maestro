// Editorial file identity is independent of the optional number burned into a frame.
export function numberedShots(plan) {
  if (!Array.isArray(plan?.shots) || !plan.shots.length) throw Error('A plan must contain shots');
  const used = new Set();
  return plan.shots.map((shot, index) => {
    if (!shot?.document) throw Error(`Missing document for shot ${index + 1}`);
    const number = shot.number ?? shot.document.clipNumber ?? index + 1;
    if (!Number.isSafeInteger(number) || number < 1 || used.has(number)) throw Error(`Invalid or duplicate shot number: ${number}`);
    used.add(number);
    return { shot, number };
  });
}
