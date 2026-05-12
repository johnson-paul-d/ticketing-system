const nodemailer =
  require("nodemailer");

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

      console.log(
        "EMAIL_USER:",
        process.env.EMAIL_USER
      );

      console.log(
        "ADMIN_EMAIL:",
        process.env.ADMIN_EMAIL
      );

      const info =
        await transporter.sendMail({

          from:
            process.env.EMAIL_USER,

          to,

          subject,

          text,
        });

      console.log(
        "MAIL SUCCESS:",
        info.response
      );

      return info;

    } catch (error) {

      console.log(
        "MAIL FULL ERROR:"
      );

      console.log(error);

      throw error;
    }
  };

module.exports =
  sendMail;