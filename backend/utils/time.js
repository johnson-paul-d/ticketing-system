const getISTTime = () => {

  const now = new Date();

  return new Date(
    now.toLocaleString(
      "en-US",
      {
        timeZone: "Asia/Kolkata",
      }
    )
  ).toISOString();
};

module.exports = getISTTime;