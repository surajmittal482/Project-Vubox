import axios from "axios";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import mongoose from "mongoose";

export const getNowPlayingMovies = async (req, res) => {
  try {
    const { data } = await axios.get(
      "https://api.themoviedb.org/3/movie/now_playing",
      {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      }
    );

    const movies = data.results;
    res.json({ success: true, movies: movies });
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

export const addShow = async (req, res) => {
  try {
    const { movieId, showsInput, showPrice } = req.body;

    let movie = await Movie.findById(movieId);

    if (!movie) {
      // Corrected: Both Axios calls now include headers properly
      const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
          headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        }),
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
          headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        }),
      ]);

      const movieApiData = movieDetailsResponse.data;
      const movieCreditsData = movieCreditsResponse.data;

      const movieDetails = {
        _id: movieId,
        title: movieApiData.title,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        genres: movieApiData.genres,
        casts: movieCreditsData.cast,
        release_date: movieApiData.release_date,
        original_language: movieApiData.original_language,
        tagline: movieApiData.tagline || "",
        vote_average: movieApiData.vote_average,
        runtime: movieApiData.runtime,
      };

      movie = await Movie.create(movieDetails);
    }

    const showsToCreate = [];

    showsInput.forEach((show) => {
      const showDate = show.date;
      show.time.forEach((time) => {
        const dateTimeString = `${showDate}T${time}`;
        showsToCreate.push({
          movie: movieId,
          showDateTime: new Date(dateTimeString),
          showPrice,
          occupiedSeats: {},
        });
      });
    });

    if (showsToCreate.length > 0) {
      await Show.insertMany(showsToCreate);
    }

    res.json({ success: true, message: 'Show Added successfully.' });

  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};




// API to get all shows from the database
export const getShows = async (req, res) => {
  try {
    const shows = await Show.find({ showDateTime: { $gte: new Date() } })
       .populate('movie')
      .sort({ showDateTime: 1 });

    // filter unique shows
    const uniqueShows = shows
  .map(s => s.movie)
  .filter((movie, index, self) =>
    index === self.findIndex(m => m._id.toString() === movie._id.toString())
  );
res.json({ success: true, shows: uniqueShows });

  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};




// API to get a single show from the database
export const getShow = async (req, res) => {
  try {
    const { movieId } = req.params;
    console.log("Fetching show for movieId:", movieId);

    // Validate movieId format
    if (!movieId || typeof movieId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID format.",
      });
    }

    // First check if movie exists
    const movie = await Movie.findById(movieId);
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found",
      });
    }

    // Get upcoming shows
    const shows = await Show.find({
      movie: movieId,
      showDateTime: { $gte: new Date() }
    }).sort({ showDateTime: 1 });

    const dateTime = {};

    shows.forEach((show) => {
      const date = show.showDateTime.toISOString().split("T")[0];
      if (!dateTime[date]) {
        dateTime[date] = [];
      }
      dateTime[date].push({
        time: show.showDateTime,
        showId: show._id
      });
    });

    return res.json({ 
      success: true, 
      movie, 
      dateTime,
      message: Object.keys(dateTime).length > 0 ? "Shows found" : "No upcoming shows for this movie"
    });

  } catch (error) {
    console.error('Error in getShow:', error);
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching show details" 
    });
  }
};