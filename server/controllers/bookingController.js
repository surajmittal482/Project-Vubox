import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import stripe from "stripe";
import mongoose from "mongoose";
import { inngest } from "../inngest/index.js";

// Function to check availability of selected seats for a movie
const checkSeatsAvailability = async (showId, selectedSeats) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(showId)) {
      throw new Error('Invalid show ID format');
    }

    const showData = await Show.findById(showId).lean();
    if (!showData) {
      throw new Error('Show not found');
    }

    if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
      throw new Error('Invalid seats selection');
    }

    const occupiedSeats = showData.occupiedSeats || {};
    
    // Check if any selected seat is already occupied
    const takenSeats = selectedSeats.filter(seat => occupiedSeats[seat]);
    if (takenSeats.length > 0) {
      throw new Error(`Seats ${takenSeats.join(', ')} are already taken`);
    }

    return true;
  } catch (error) {
    console.error('Seat availability check error:', error.message);
    throw error;
  }
};

export const createBooking = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { showId, selectedSeats } = req.body;
    const { origin } = req.headers;

    // Check if the seat is available for the selected show
    const isAvailable = await checkSeatsAvailability(showId, selectedSeats);

    if (!isAvailable) {
      return res.json({
        success: false,
        message: "Selected Seats are not available.",
      });
    }

    // Get the show details
    const showData = await Show.findById(showId).populate("movie");

    // Create a new booking
    const booking = await Booking.create({
      user: userId,
      show: showId,
      amount: showData.showPrice * selectedSeats.length,
      bookedSeats: selectedSeats,
    });

    selectedSeats.map((seat) => {
      showData.occupiedSeats[seat] = userId;
    });

    showData.markModified("occupiedSeats");
    await showData.save();

  // Stripe Gateway Initialize
const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)

// Creating line items to for Stripe
const line_items = [{
  price_data: {
    currency: 'AUD',
    product_data: {
      name: showData.movie.title
    },
    unit_amount: Math.floor(booking.amount) * 100
  },
  quantity: 1
}]

const session = await stripeInstance.checkout.sessions.create({
  success_url: `${origin}/loading/my-bookings`,
  cancel_url: `${origin}/my-bookings`,
  line_items: line_items,
  mode: 'payment',
  metadata: {
    bookingId: booking._id.toString()
  },
  expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Expires in 30 minutes
})

booking.paymentLink = session.url
await booking.save()

// Timeout fallback: if inngest.send hangs, fallback after 2 seconds
try {
  await Promise.race([
    inngest.send({
      name: "app/checkpayment",
      data: { bookingId: booking._id.toString() },
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Inngest timeout")), 2000)
    ),
  ]);
  console.log("Inngest scheduled successfully");
} catch (err) {
  console.error("Inngest send failed or timed out:", err.message);
}
    res.json({ success: true,url: session.url });
  } catch (error) {
    // Handle error here
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};



export const getOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(showId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid show ID format'
      });
    }

    const showData = await Show.findById(showId).lean();
    if (!showData) {
      return res.status(404).json({
        success: false,
        message: 'Show not found'
      });
    }

    const occupiedSeats = Object.keys(showData.occupiedSeats || {});

    return res.status(200).json({
      success: true,
      occupiedSeats,
      total: occupiedSeats.length
    });
  } catch (error) {
    console.error('Get occupied seats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch occupied seats',
      error: error.message
    });
  }
};
