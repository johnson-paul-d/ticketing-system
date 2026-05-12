const nodemailer = require("nodemailer");

const transporter =
  nodemailer.createTransport({
    service: "gmail",

    auth: {
      user:
        process.env.EMAIL_USER,

      pass:
        process.env.EMAIL_PASS,
    },
  });

const sendMail =
  async ({
    to,
    subject,
    text,
  }) => {

    try {

      const info =
        await transporter.sendMail({
          from:
            `"Ticket System" <${process.env.EMAIL_USER}>`,

          to,

          subject,

          text,
        });

      console.log(
        "MAIL SENT:",
        info.response
      );

    } catch (error) {

      console.log(
        "MAIL ERROR:",
        error
      );
    }
  };

module.exports =
  sendMail;