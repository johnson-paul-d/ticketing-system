const getISTTime = () => {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};
module.exports = getISTTime;