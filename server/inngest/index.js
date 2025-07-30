import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import sendEmail from "../configs/nodeMailer.js";
// Create a client to send and receive events
export const inngest = new Inngest({ id: "movie-ticket-booking" });

const image_base_url = import.meta.env.VITE_TMDB_IMAGE_BASE_URL;

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
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; background-color: #f8f9fa; padding: 30px; color: #2c3e50; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #7D3C98 0%, #9B59B6 100%); padding: 30px; border-radius: 12px; text-align: center; color: white; margin-bottom: 25px;">
      <h1 style="margin: 0; font-size: 32px; font-weight: 600;">🎬 VUBOX</h1>
      <h2 style="margin: 15px 0 5px; font-size: 24px; font-weight: 500;">Booking Confirmed! 🎉</h2>
      <p style="margin: 10px 0; font-size: 16px; opacity: 0.9;">Booking ID: <strong>${booking?.bookingId || "N/A"}</strong></p>
    </div>

    <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div style="text-align: center; margin-bottom: 25px;">
        <img src="${image_base_url+booking?.show?.movie?.posterUrl || 'https://via.placeholder.com/150'}" 
             alt="${booking?.show?.movie?.title || 'Movie'} Poster" 
             style="width: 180px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"/>
      </div>

      <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px; font-size: 16px;">
        <tr>
          <td style="color: #666; padding: 8px 15px; width: 30%;"><strong>Movie</strong></td>
          <td style="padding: 8px 15px; background: #f8f9fa; border-radius: 6px;">
            ${booking?.show?.movie?.title || 'N/A'} 
            <span style="color: #7D3C98; font-weight: 500;">(${booking?.show?.format || '2D'})</span>
          </td>
        </tr>
        <tr>
          <td style="color: #666; padding: 8px 15px;"><strong>Date</strong></td>
          <td style="padding: 8px 15px; background: #f8f9fa; border-radius: 6px;">
            ${new Date(booking?.show?.showDateTime).toLocaleDateString("en-IN", { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric', 
              timeZone: 'Asia/Kolkata' 
            })}
          </td>
        </tr>
        <tr>
          <td style="color: #666; padding: 8px 15px;"><strong>Time</strong></td>
          <td style="padding: 8px 15px; background: #f8f9fa; border-radius: 6px;">
            ${new Date(booking?.show?.showDateTime).toLocaleTimeString("en-IN", { 
              hour: '2-digit', 
              minute: '2-digit', 
              timeZone: 'Asia/Kolkata' 
            })}
          </td>
        </tr>
        <tr>
          <td style="color: #666; padding: 8px 15px;"><strong>Theatre</strong></td>
          <td style="padding: 8px 15px; background: #f8f9fa; border-radius: 6px;">
            ${booking?.show?.theatre || 'N/A'}${booking?.show?.city ? `, ${booking?.show?.city}` : ''}
          </td>
        </tr>
        <tr>
          <td style="color: #666; padding: 8px 15px;"><strong>Screen</strong></td>
          <td style="padding: 8px 15px; background: #f8f9fa; border-radius: 6px;">
            ${booking?.show?.screen || 'N/A'}
          </td>
        </tr>
        <tr>
          <td style="color: #666; padding: 8px 15px;"><strong>Seats</strong></td>
          <td style="padding: 8px 15px; background: #f8f9fa; border-radius: 6px;">
            ${(booking?.seats || []).join(', ') || 'N/A'}
          </td>
        </tr>
      </table>

      <div style="margin-top: 30px; text-align: center;">
        <a href="${booking?.appLink || '#'}" 
           style="display: inline-block; background: linear-gradient(135deg, #7D3C98 0%, #9B59B6 100%); 
                  color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; 
                  font-weight: 500; transition: transform 0.2s; box-shadow: 0 2px 8px rgba(125,60,152,0.3);">
          View Booking in App
        </a>
      </div>
    </div>

    <div style="margin-top: 30px; text-align: center; color: #2c3e50;">
      <p style="font-size: 16px; margin: 0;">
        Thank you for choosing <strong>Vubox</strong>!<br/>
        We hope you enjoy the show! 🍿
      </p>
      <p style="font-size: 13px; color: #666; margin-top: 15px;">
        This is an automated message. Please do not reply.
      </p>
    </div>
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
