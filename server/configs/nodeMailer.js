import nodemailer from 'nodemailer';

// Create the transporter object using SMTP
const transporter = nodemailer.createTransport({
  service: "gmail", // Use Gmail SMTP service
  auth: {
    user: process.env.SMTP_USER, // Use your Gmail address (e.g., 'example@gmail.com')
    pass: process.env.SMTP_PASS, // Use your Gmail App Password
  },
});

// Send email function
const sendEmail = async ({ to, subject, body }) => {
  try {
    const response = await transporter.sendMail({
      from: process.env.SENDER_EMAIL, // From the configured sender email
      to, // Recipient email
      subject, // Subject line
      html: body, // Body of the email in HTML format
    });
    return response;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error('Email failed to send');
  }
};

export default sendEmail;
