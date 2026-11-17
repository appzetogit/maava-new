import { useState, useEffect, useRef } from 'react';

export function useScrollDirection() {
    const [scrollDirection, setScrollDirection] = useState("up");
    const lastScrollY = useRef(0);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.pageYOffset;
            const direction = currentScrollY > lastScrollY.current ? "down" : "up";

            // Only update if difference is significant to avoid flickering
            if (Math.abs(currentScrollY - lastScrollY.current) > 10) {
                setScrollDirection(direction);
            }

            lastScrollY.current = currentScrollY;
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return scrollDirection;
}
