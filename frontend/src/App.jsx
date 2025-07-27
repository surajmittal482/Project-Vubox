import React from "react";
import { Route, Routes, useLocation } from "react-router-dom";

// Import each page from its respective file
import Home from "./pages/Home";
import MovieDetails from "./pages/MovieDetails";
import SeatLayout from "./pages/SeatLayout";
import MyBooking from "./pages/MyBooking";


import Footer from "./components/Footer";
import Favorite from "./pages/Favorite";
import Movies from "./pages/Movies";
import { Toaster } from "react-hot-toast";
import Layout from "./pages/admin/Layout";
import Dashboard from "./pages/admin/Dashboard";
import AddShows from "./pages/admin/AddShows";
import ListShows from "./pages/admin/ListShows";
import ListBookings from "./pages/admin/ListBookings";
import { useAppContext } from "./context/AppContxt";
import { SignIn } from "@clerk/clerk-react";
import Loading from "./components/Loading";
import Navbar from "./components/Navbar";



const App = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  const { user } = useAppContext();

  return (
    <>
      {/* Show Navbar only for non-admin routes */}
      <Toaster />
      {!isAdminRoute && <Navbar />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/movies/:id" element={<MovieDetails />} />
        <Route path="/movie/:id/:date" element={<SeatLayout />} />

        <Route path="/my-bookings" element={<MyBooking />} />
        <Route path='/loading/:nextUrl' element={<Loading/>} />

        <Route path="/favorite" element={<Favorite />} />
        <Route
          path="/admin/*"
          element={
            user ? (
              <Layout />
            ) : (
              <div className="min-h-screen flex justify-center items-center">
                <SignIn fallbackRedirectUrl={"/admin"} />
              </div>
            )
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="add-shows" element={<AddShows />} />
          <Route path="list-shows" element={<ListShows />} />
          <Route path="list-bookings" element={<ListBookings />} />
        </Route>
      </Routes>

      {/* Show Footer only for non-admin routes */}
      {!isAdminRoute && <Footer />}
    </>
  );
};

export default App;
