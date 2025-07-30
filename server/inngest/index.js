import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import sendEmail from "../configs/nodeMailer.js";
// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

// Ingest Function to save user data to a database
const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await User.create(userData);
  }
);

// Inngest Function to delete user from database
const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    const { id } = event.data;
    await User.findByIdAndDelete(id);
  }
);

// Inngest Function to update user data in database
const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await User.findByIdAndUpdate(id, userData);
  }
);

// Inngest Function to cancel booking and release seats of show after 10 minutes of
// booking created if payment is not made
const releaseSeatsAndDeleteBooking = inngest.createFunction(
  {
    id: "release-seats-delete-booking",
    cancelOn: [
      {
        event: "booking.paid", // event we send on successful payment
        match: "data.bookingId == event.data.bookingId",
      },
    ],
  },
  { event: "app/checkpayment" },
  async ({ event, step }) => {
    // Delay 10 minutes
    await step.sleep("wait-10-min-to-check", "10m");

    // Run payment check logic
    await step.run("check-payment-status", async () => {
      const booking = await Booking.findById(event.data.bookingId);
      if (!booking) return;
      if (booking.isPaid) return;

      const show = await Show.findById(booking.show);
      if (!show) return;

      booking.bookedSeats.forEach((seat) => delete show.occupiedSeats[seat]);

      show.markModified("occupiedSeats");
      await show.save();
      await Booking.findByIdAndDelete(booking._id);
    });
  }
);

// Inngest function to send email when user books a show
const sendBookingConfirmationEmail = inngest.createFunction(
  { id: "send-booking-confirmation-email" },
  { event: "app/show.booked" },
  async ({ event, step }) => {
    const { bookingId } = event.data;

    try {
      // Fetch booking details, including associated user and show/movie details
      const booking = await Booking.findById(bookingId)
        .populate({
          path: "show",
          populate: { path: "movie", model: "Movie" },
        })
        .populate("user");

      // Prepare the email body with dynamic values from the booking
      const emailBody = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #f8f9fa; padding: 20px; color: #333;">
    <div style="background: #7D3C98; color: white; padding: 30px 20px; border-radius: 10px 10px 0 0; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">🎟️ VUBOX</h1>
      <h2 style="margin: 10px 0;">Yaay!! Your Booking is Confirmed! 🎉</h2>
      <p style="margin: 5px 0; font-size: 16px;">Booking ID: <strong>${booking.bookingId}</strong></p>
    </div>

    <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 20px; border-radius: 0 0 10px 10px;">
      <div style="display: flex; flex-direction: row; gap: 15px;">
        <img src="${booking.show.movie.posterUrl}" alt="${booking.show.movie.title}" style="width: 120px; height: auto; border-radius: 6px; object-fit: cover;" />
        <div>
          <h3 style="margin: 0 0 8px 0;">${booking.show.movie.title} (${booking.show.format})</h3>
          <p style="margin: 0;">
            <strong>🕒 Time:</strong> ${new Date(
              booking.show.showDateTime
            ).toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata" })}<br/>
            <strong>📅 Date:</strong> ${new Date(
              booking.show.showDateTime
            ).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br/>
            <strong>📍 Location:</strong> ${booking.show.theatre}, ${booking.show.city}<br/>
            <strong>🪑 Seats:</strong> ${booking.seats.join(", ")}<br/>
            <strong>🎬 Screen:</strong> ${booking.show.screen}
          </p>
        </div>
      </div>

      <div style="margin-top: 20px; text-align: center;">
        <a  style="background-color: #7D3C98; color: white; text-decoration: none; padding: 12px 24px; border-radius: 5px; display: inline-block; font-weight: bold;">Open in App</a>
      </div>
    </div>

    <p style="margin-top: 30px; font-size: 14px; color: #666; text-align: center;">
      Thank you for booking with <strong>Vubox</strong>! We hope you enjoy the show! 🍿
    </p>

    <p style="text-align: center; font-size: 12px; color: #aaa;">
      This is an automated message. Please do not reply directly.
    </p>
  </div>
`;



      // Call sendEmail function to send the confirmation email
      await sendEmail({
        to: booking.user.email, // Recipient email (the user who made the booking)
        subject: `Payment Confirmation: "${booking.show.movie.title}" booked!`,
        body: emailBody, // Email body (HTML)
      });

      console.log(`Booking confirmation email sent to ${booking.user.email}`);

    } catch (error) {
      console.error("Error processing booking or sending email:", error);
      throw new Error('Booking confirmation email failed');
    }
  }
);


// Inngest Function to send reminders
const sendShowReminders = inngest.createFunction(
  { id: "send-show-reminders" },
  { cron: "0 */8 * * *" }, // Every 8 hours
  async ({ step }) => {
    const now = new Date();
    const in8Hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const windowStart = new Date(in8Hours.getTime() - 10 * 60 * 1000);

    // Prepare reminder tasks
    const reminderTasks = await step.run("prepare-reminder-tasks", async () => {
      const shows = await Show.find({
        showTime: { $gte: windowStart, $lte: in8Hours },
      }).populate("movie");

      const tasks = [];

      for (const show of shows) {
        if (!show.movie || !show.occupiedSeats) continue;

        const userIds = [...new Set(Object.values(show.occupiedSeats))];
        if (userIds.length === 0) continue;

        const users = await User.find({ _id: { $in: userIds } }).select(
          "name email"
        );
        for (const user of users) {
          tasks.push({
            userEmail: user.email,
            userName: user.name,
            movieTitle: show.movie.title,
            showTime: show.showTime,
          });
        }
      }

      return tasks;
    });

    if (reminderTasks.length === 0) {
      return { sent: 0, message: "No reminders to send." };
    }

    // Additional logic can go here (e.g., sending the reminders)
    // Send reminder emails
    const results = await step.run("send-all-reminders", async () => {
      return await Promise.allSettled(
        reminderTasks.map((task) =>
          sendEmail({
            to: task.userEmail,
            subject: `Reminder: Your movie "${task.movieTitle}" starts soon!`,
            body: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Hello ${task.userName},</h2>
          <p>This is a quick reminder that your movie:</p>
          <h3 style="color: #F84565;">${task.movieTitle}</h3>
          <p>
            is scheduled for <strong>${new Date(
              task.showTime
            ).toLocaleDateString("en-US", {
              timeZone: "Asia/Kolkata",
            })}</strong> at 
            <strong>${new Date(task.showTime).toLocaleTimeString("en-US", {
              timeZone: "Asia/Kolkata",
            })}</strong>.
          </p>
          <p>It starts in approximately <strong>8 hours</strong> - make sure you're ready!</p>
          <br/>
          <p>Enjoy the show!<br/>QuickShow Team</p>
        </div>
      `,
          })
        )
      );
    });

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - sent;

    return {
      sent,
      failed,
      message: `Sent ${sent} reminder(s), ${failed} failed.`,
    };
  }
);

export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  releaseSeatsAndDeleteBooking,
  sendBookingConfirmationEmail,
  sendShowReminders
];
