import Booking from "../models/Booking.js";
import { clerkClient } from "@clerk/express";
import Movie from "../models/Movie.js";

// API Controller Function to Get User Bookings
export const getUserBookings = async (req, res) => {
  try {
    const user = req.auth().userId;

    const bookings = await Booking.find({ user })
      .populate({
        path: "show",
        populate: { path: "movie" },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    console.error(error.message);
    res.json({ success: false, message: error.message });
  }
};

// API Controller Function to update Favorite Movie in Clerk User Metadata
export const updateFavorite = async (req, res) => {
  try {
    const { movieId } = req.body;
    const userId = req.auth().userId;

    const user = await clerkClient.users.getUser(userId);

    if (!Array.isArray(user.privateMetadata.favorites)) {
      user.privateMetadata.favorites = [];
    }

    const favorites = user.privateMetadata.favorites;

    if (!favorites.includes(movieId)) {
      favorites.push(movieId);
    } else {
      user.privateMetadata.favorites = favorites.filter(
        (item) => item !== movieId
      );
    }



    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: user.privateMetadata,
    });

    res.json({ success: true, message: "Favorite updated successfully." });


  } catch (error) {
    console.error(error.message);
    res.json({ success: false, message: error.message });
  }
};


export const getFavorites = async (req, res) => {
  try {
    const user = await clerkClient.users.getUser(req.auth().userId);
    let favorites = user.privateMetadata.favorites;
    if (!Array.isArray(favorites)) {
      favorites = [];
    }

    // Getting movies from database
    const movies = await Movie.find({ _id: { $in: favorites } });

    res.json({ success: true, movies });
  } catch (error) {
    console.error(error.message);
    res.json({ success: false, message: error.message });
  }
};

