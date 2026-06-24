export function deriveMealStatus(job, prediction, mealPallets, trailers) {
  if (!job || job.total_quantity === 0) return 'not_started';

  if (mealPallets.length > 0) {
    const allLoaded = mealPallets.every(p => p.status === 'loaded_to_trailer');
    const allTrailersClosed = mealPallets
      .filter(p => p.status === 'loaded_to_trailer')
      .every(p => {
        const trailer = trailers.find(t => t.id === p.trailer_id);
        return trailer?.status === 'loaded_closed';
      });
    if (allLoaded && allTrailersClosed && mealPallets.length > 0) return 'completed';
    if (mealPallets.some(p => p.status === 'loaded_to_trailer')) return 'loaded_to_trailer';
    if (mealPallets.some(p => p.status === 'ready_for_pickup')) return 'palletted';
  }

  const target = prediction?.target_quantity;
  if (target && job.total_quantity > target) return 'over_target';
  if (job.total_quantity > 0) return 'in_progress';
  return 'not_started';
}

export const STATUS_CONFIG = {
  not_started:       { label: 'Not started',      tailwind: 'bg-gray-400',  text: 'text-gray-500',  border: 'border-gray-400'  },
  in_progress:       { label: 'In progress',       tailwind: 'bg-amber-400', text: 'text-amber-600', border: 'border-amber-400' },
  over_target:       { label: 'Over target',       tailwind: 'bg-red-500',   text: 'text-red-600',   border: 'border-red-500'   },
  palletted:         { label: 'Palletted',         tailwind: 'bg-blue-500',  text: 'text-blue-600',  border: 'border-blue-500'  },
  loaded_to_trailer: { label: 'Loaded to trailer', tailwind: 'bg-green-500', text: 'text-green-600', border: 'border-green-500' },
  completed:         { label: 'Completed',         tailwind: 'bg-gray-800',  text: 'text-gray-800',  border: 'border-gray-800'  },
};
