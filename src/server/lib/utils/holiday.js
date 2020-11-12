// import _ from 'lodash';
// import holiday from '../../../../config/holiday.json';

// // source: https://data.nat.gov.tw/comment/10360 政府資料開放平臺
// // API: http://data.ntpc.gov.tw/api/v1/rest/datastore/382000000A-000077-002
// // date; YYYY/M/D

// const isHoliday = (date) => {
//   const { records } = holiday.result;

//   const index = _.findIndex(records, o => o.date === date);

//   if (index === -1) {
//     return false;
//   }

//   if (records[index].isHoliday === '否') {
//     return false;
//   }

//   return true;
// };

// // startDate: the UTC timestamp

// const nextWorkingDay = (startDate) => {
//   console.log(startDate);
//   return startDate;
// };

// export { isHoliday, nextWorkingDay };
