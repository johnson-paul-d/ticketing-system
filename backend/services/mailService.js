const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async ({
  to,
  subject,
  text,
}) => {
  try {
    const response = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
      subject,
      text,
    });

    console.log(response);

    return response;

  } catch (error) {
    console.log(error);

    throw error;
  }
};

module.exports = sendMail;