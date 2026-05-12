const { Resend } = require("resend");
console.log(process.env.RESEND_API_KEY);

const resend = new Resend(
  process.env.RESEND_API_KEY
);

const sendMail = async ({
  to,
  subject,
  text,
}) => {
  try {
    const response =
      resend.emails.send({
        from:
          "Ticketing <onboarding@resend.dev>",

        to,

        subject,

        text,
      });

    console.log(
      "EMAIL SENT:",
      response
    );

    return {
      success: true,
      data: response,
    };
  } catch (error) {
    console.log(
      "EMAIL ERROR:",
      error
    );

    return {
      success: false,
      error,
    };
  }
};

module.exports = sendMail;