import { useEffect, useState } from 'react';
import { isSameDay } from 'date-fns';

export function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    const refreshCurrentDate = () => {
      const nextDate = new Date();
      setCurrentDate((previousDate) => (isSameDay(previousDate, nextDate) ? previousDate : nextDate));
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCurrentDate();
    };

    window.addEventListener('focus', refreshCurrentDate);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshCurrentDate);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  return currentDate;
}
