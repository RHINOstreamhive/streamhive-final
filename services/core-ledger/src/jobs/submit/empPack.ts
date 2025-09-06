import fs from 'fs';
import path from 'path';
import { ensureYearArg, YEAR, emit, copyIfExists, paths, zipDir } from './_shared';

ensureYearArg();

(() => {
  const { returnsDir, outDir, zipPath } = paths('EMP');
  const manifest: string[] = [];

  // Copy EMP501 (Jun/Nov) if present
  copyIfExists(path.join(returnsDir, 'EMP501-Jun.pdf'), outDir, manifest);
  copyIfExists(path.join(returnsDir, 'EMP501-Nov.pdf'), outDir, manifest);

  // Copy all monthly EMP201s / Payroll Registers / Proofs if present
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    copyIfExists(path.join(returnsDir, `EMP201-${YEAR}-${mm}.pdf`), outDir, manifest);
    copyIfExists(path.join(returnsDir, `PayrollRegister-${YEAR}-${mm}.pdf`), outDir, manifest);
    copyIfExists(path.join(returnsDir, `ProofOfPayment-${YEAR}-${mm}.pdf`), outDir, manifest);
  }

  emit(outDir, 'MANIFEST.txt', manifest.join('\n') + '\n', manifest);
  zipDir(outDir, zipPath).then(() => console.log('✅ EMP pack ready →', zipPath));
})();
