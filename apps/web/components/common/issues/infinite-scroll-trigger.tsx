'use client';

import { useEffect, useRef } from 'react';

interface InfiniteScrollTriggerProps {
   onLoadMore: () => void;
   isBusy: boolean;
}

export function InfiniteScrollTrigger({ onLoadMore, isBusy }: InfiniteScrollTriggerProps) {
   const sentinelRef = useRef<HTMLDivElement>(null);
   const onLoadMoreRef = useRef(onLoadMore);

   useEffect(() => {
      onLoadMoreRef.current = onLoadMore;
   }, [onLoadMore]);

   useEffect(() => {
      const sentinel = sentinelRef.current;
      if (isBusy || !sentinel || typeof IntersectionObserver === 'undefined') return;

      const observer = new IntersectionObserver(
         ([entry]) => {
            if (entry?.isIntersecting) onLoadMoreRef.current();
         },
         { root: sentinel.parentElement, rootMargin: '0px 0px 320px 0px' }
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
   }, [isBusy]);

   return <div ref={sentinelRef} aria-hidden="true" className="h-2 w-full shrink-0" />;
}
