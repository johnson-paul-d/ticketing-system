const { Resend } = require("resend");

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
      await resend.emails.send({
        from:
          "Ticketing <onboarding@resend.dev>",

        to,

        subject,

        text,
      });

    console.log(
      "MAIL SUCCESS:",
      response
    );

    return {
      success: true,
    };
  } catch (error) {
    console.log(
      "MAIL ERROR:",
      error
    );

    return {
      success: false,
      error,
    };
  }
};

module.exports = sendMail;