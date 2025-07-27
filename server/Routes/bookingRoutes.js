import express from 'express';
import { createBooking, getOccupiedSeats } from '../controllers/bookingController.js';

const bookingRouter = express.Router();

// Route to create a booking
bookingRouter.post('/create', createBooking);

// Route to get occupied seats for a specific show
bookingRouter.get('/seats/:showId', getOccupiedSeats);

export default bookingRouter;
