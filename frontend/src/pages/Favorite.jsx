import React from 'react';
import { dummyShowsData } from '../assets/assets';
import MovieCard from '../components/MovieCard';
import BlurCircle from '../components/BlurCircle';
import { useAppContext } from '../context/AppContxt';

const Favorite = () => {
  const {favoriteMovies} = useAppContext();
  return favoriteMovies.length > 0 ? (
    <div className="relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]">
      <BlurCircle top="150px" left="0px" />
      <BlurCircle bottom="50px" right="50px" />
      <h1 className="text-lg font-medium my-4">Your Favorite Movies</h1>
      <div className="flex flex-wrap max-sm:justify-center gap-8">
        {favoriteMovies.map((movie) => (
          <MovieCard movie={movie} key={movie.id} />
        ))}
      </div>
    </div>
  ) : (
    <div className="flex justify-center items-center min-h-[80vh]">
      <h2 className="text-xl text-gray-500">No movies available at the moment. Please check back later!</h2>
    </div>
  );
};

export default Favorite;
