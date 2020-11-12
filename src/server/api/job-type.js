const CALCULATE_ALL_DATA = 1;
const RECALCULATED = 2;
const RECALCULATED_ERROR = 3;
const RECALCULATED_GEN_ERROR = 4;
const TRANSFER_BILL = 5;

const jobTypeMapping = {
  [CALCULATE_ALL_DATA]: 'Calculate all bill',
  [RECALCULATED]: 'Re-calculate',
  [RECALCULATED_ERROR]:
    'Re-calculate error which generate from calculating all bill job',
  [RECALCULATED_GEN_ERROR]:
    'Re-calculate error which generate from Re-calculating job',
  [TRANSFER_BILL]: 'Transfer',
};

export {
  CALCULATE_ALL_DATA,
  RECALCULATED,
  RECALCULATED_ERROR,
  RECALCULATED_GEN_ERROR,
  TRANSFER_BILL,
  jobTypeMapping,
};
