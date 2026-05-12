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
        "EMAIL USER:",
        process.env.EMAIL_USER
      );

      console.log(
        "ADMIN EMAIL:",
        process.env.ADMIN_EMAIL
      );

      const info =
        await transporter.sendMail({

          from:
            `"Ticket System" <${process.env.EMAIL_USER}>`,

          to,

          subject,

          text,
        });

      console.log(
        "MAIL SUCCESS:"
      );

      console.log(
        info.response
      );

      return info;

    } catch (error) {

      console.log(
        "MAIL ERROR:"
      );

      console.log(error);

      throw error;
    }
  };

module.exports =
  sendMail;