import stripe from "stripe";
import Booking from "../models/Booking.js";
import { inngest } from "../inngest/index.js";

export const stripeWebhooks = async (request, response) => {
  console.log("Received Stripe webhook event");
  console.dir(request.body, { depth: null, colors: true });
  let event;
  const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
  const sig = request.headers["stripe-signature"];

  try {
    event = stripeInstance.webhooks.constructEvent(
      request.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);
    return response.status(400).json({
      success: false,
      message: `Webhook Error: ${error.message}`,
    });
  }
  console.log("✅ Stripe webhook received:");
  console.dir(event, { depth: null, colors: true });
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        if (!paymentIntent?.id) {
          throw new Error("Invalid payment intent data");
        }

        const sessionList = await stripeInstance.checkout.sessions.list({
          payment_intent: paymentIntent.id,
          limit: 1,
        });
        console.log("Stripe session list:", sessionList);
        if (!sessionList?.data?.[0]?.metadata?.bookingId) {
          throw new Error("No valid booking ID found in session metadata");
        }

        const { bookingId } = sessionList.data[0].metadata;
        console.log(`Processing payment for booking ID: ${bookingId}`);

        const updatedBooking = await Booking.findByIdAndUpdate(
          bookingId,
          {
            isPaid: true,
            isBooked: true,
            paymentLink: "",
          },
          { new: true }
        );

        // Send Confirmation Email
        await inngest.send({
          name: "app/show.booked",
          data: { bookingId },
        });

        if (!updatedBooking) {
          throw new Error(`Booking update failed for ID: ${bookingId}`);
        }

        console.log(`Successfully processed payment for booking: ${bookingId}`);
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return response.status(200).json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error("Webhook processing error:", error.message);
    return response.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error.message,
    });
  }
};
