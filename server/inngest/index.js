import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import sendEmail from "../configs/nodeMailer.js";
// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

const image_base_url = process.env.VITE_TMDB_IMAGE_BASE_URL;

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
    // Prepare poster URL with fallback
    const posterUrl = booking?.show?.movie?.posterUrl 
      ? `${image_base_url}${booking.show.movie.posterUrl}` 
      : 'https://via.placeholder.com/150';

    const emailBody = `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: auto; color: #333;">
    <h2 style="color: #F84565;">Hi ${booking.user.name},</h2>

    <p>
      Great news! Your booking for 
      <strong style="color: #F84565;">"${booking.show.movie.title}"</strong> 
      has been successfully confirmed. 🎟️
    </p>

    <p>
      Here are your booking details:
    </p>

    <div style="background-color: #f0f0f0; padding: 16px; border-left: 4px solid #F84565; margin: 20px 0;">
      <p style="margin: 0;">
        <strong>🎬 Movie:</strong> ${booking.show.movie.title}<br/>
        <strong>📅 Date:</strong> ${new Date(
          booking.show.showDateTime
        ).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" })}<br/>
        <strong>⏰ Time:</strong> ${new Date(
          booking.show.showDateTime
        ).toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata" })}
      </p>
    </div>

    <p>
      Please arrive at the venue at least 15 minutes before the showtime. Bring your confirmation or ID for entry.
    </p>

    <p>
      We hope you enjoy your movie experience with us! 🍿
    </p>

    <p>
      Thank you for choosing <strong>QuickShow</strong>.<br/>
      If you have any questions or need help, feel free to reach out.
    </p>

    <p style="margin-top: 30px;">
      Warm regards,<br/>
      — The QuickShow Team
    </p>

    <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;" />
    <p style="font-size: 12px; color: #888;">
      This is an automated email. Please do not reply directly.
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
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; background-color: #f8f9fa; padding: 30px; color: #2c3e50; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #7D3C98 0%, #9B59B6 100%); padding: 25px; border-radius: 12px; text-align: center; color: white; margin-bottom: 25px;">
            <h1 style="margin: 0; font-size: 32px; font-weight: 600;">🎬 VUBOX</h1>
            <h2 style="margin: 15px 0 5px; font-size: 24px; font-weight: 500;">Movie Reminder</h2>
          </div>

          <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <h2 style="color: #2c3e50; margin-top: 0;">Hello ${task.userName},</h2>
            <p style="font-size: 16px; color: #666;">This is a friendly reminder about your upcoming movie:</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #7D3C98; margin: 0 0 15px 0;">${task.movieTitle}</h3>
              <p style="margin: 8px 0; color: #2c3e50;">
                <strong>Date:</strong> ${new Date(task.showTime).toLocaleDateString("en-US", {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'Asia/Kolkata'
                })}
              </p>
              <p style="margin: 8px 0; color: #2c3e50;">
                <strong>Time:</strong> ${new Date(task.showTime).toLocaleTimeString("en-US", {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata'
                })}
              </p>
            </div>

            <p style="color: #e74c3c; font-weight: 500; text-align: center; margin: 25px 0;">
              ⏰ Starts in approximately <strong>8 hours</strong>
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />

            <p style="text-align: center; color: #2c3e50; margin: 0;">
              We hope you enjoy the show! 🍿<br/>
              <span style="font-size: 14px; color: #666;">Best regards,<br/>The VUBOX Team</span>
            </p>
          </div>

          <p style="text-align: center; font-size: 13px; color: #666; margin-top: 20px;">
            This is an automated reminder. Please do not reply.
          </p>
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
