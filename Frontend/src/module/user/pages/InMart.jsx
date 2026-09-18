import { useState, useCallback, useEffect, useMemo } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  ShoppingBag,
  Coffee,
  Home,
  Gamepad2,
  Apple,
  Headphones,
  Smartphone,
  Sparkles,
  Shirt,
  ChevronRight,
  Heart,
  Mic,
  Navigation,
  MapPin,
  Clock,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  MoreVertical,
  Compass,
  X,
  ArrowLeft
} from "lucide-react"
import { Input } from "@/components/ui/input"
import AnimatedPage from "../components/AnimatedPage"
import { useSearchOverlay, useLocationSelector } from "../components/UserLayout"
import { useProfile } from "../context/ProfileContext"
import api from "@/lib/api"
import inmartAPI from "@/lib/api/inmartAPI"
import PageNavbar from "../components/PageNavbar"
import AddToCartButton from "../components/AddToCartButton"
import promoBanner from "@/assets/inmart/promo_banner.png"
import mccainFries from "@/assets/inmart/mccain_fries.png"



const ProductCard = ({ product, themeColor }) => (
  <div className="flex-shrink-0 w-[145px] sm:w-[175px] md:w-[200px] lg:w-[225px] bg-white dark:bg-[#1a1a1a] rounded-2xl p-2 md:p-3 relative shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100/50 dark:border-white/5 group">
    {/* Discount Badge */}
    <div className="absolute top-0 left-0 z-10">
      <div className="relative">
        <svg width="42" height="42" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="sm:w-11 sm:h-11 drop-shadow-sm">
          <path d="M24 0L27.9 5.7L34.5 4.5L36.3 11.1L42.9 12.9L41.7 19.5L47.4 23.4L41.7 27.3L42.9 33.9L36.3 35.7L34.5 42.3L27.9 41.1L24 46.8L20.1 41.1L13.5 42.3L11.7 35.7L5.1 33.9L6.3 27.3L0.6 23.4L6.3 19.5L5.1 12.9L11.7 11.1L13.5 4.5L20.1 5.7L24 0Z" fill={themeColor || "#8B5CF6"} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white font-[900] leading-none">
          <span className="text-[10px] sm:text-[11px]">{product.discount}</span>
          <span className="text-[8px] sm:text-[9px] uppercase -mt-0.5">OFF</span>
        </div>
      </div>
    </div>

    {/* New Tag */}
    {product.isNew && (
      <div className="absolute top-2 right-2 z-10 bg-[#FF5C5C] text-white text-[9px] sm:text-[10px] md:text-xs font-black px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md flex items-center justify-center shadow-sm">
        NEW
      </div>
    )}

    {/* Product Image Area */}
    <div className="relative aspect-square w-full mb-2 bg-gray-50/50 dark:bg-white/5 rounded-xl flex items-center justify-center p-1.5 overflow-hidden">
      <img src={product.image} alt={product.name} className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-300" />

      {/* Liked Heart Icon - Moved to bottom right of image area */}
      <button className="absolute bottom-1 right-1 p-1 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm border border-gray-100/50 dark:border-white/10 opacity-0 group-hover:opacity-100 transition-all">
        <Heart size={14} className="text-[#FF725E] fill-current" />
      </button>
    </div>

    {/* Product Details */}
    <div className="px-1 space-y-0.5">
      <h3 className="text-[13px] sm:text-[14px] font-[700] text-[#101828] dark:text-gray-100 line-clamp-2 break-words leading-[1.2] tracking-tight min-h-[32px] sm:min-h-[36px] overflow-hidden">
        {product.name}
      </h3>
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
        {product.weight}
      </p>
    </div>

    {/* Price and Add Button */}
    <div className="mt-2.5 px-1 flex items-center justify-between gap-1.5">
      <div className="flex flex-col leading-none min-w-0">
        <span className={`font-[900] text-gray-900 dark:text-white tracking-tighter ${product.price > 9999 ? 'text-xs' : 'text-sm'}`}>
          ₹{product.price}
        </span>
        {product.originalPrice && (
          <span className="text-[10px] text-gray-400 line-through tracking-tighter decoration-1">
            ₹{product.originalPrice}
          </span>
        )}
      </div>
      <div className="flex-shrink-0">
        <AddToCartButton
          item={{
            ...product,
            restaurant: "Hibermart",
            restaurantId: "hibermart-id"
          }}
          className="w-[45px] sm:w-[50px]"
        />
      </div>
    </div>
  </div>
);

const NewlyLaunchedCard = ({ product, themeColor }) => (
  <div className="flex-shrink-0 w-[150px] sm:w-[185px] md:w-[210px] bg-white dark:bg-[#1a1a1a] rounded-2xl overflow-hidden relative shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-white/5 group flex flex-col h-full">
    {/* Product Image Area */}
    <div className="relative aspect-square w-full bg-[#F5F5F5] dark:bg-white/5 flex items-center justify-center p-2 overflow-hidden">
      <img
        src={product.image}
        alt={product.name}
        className="w-[85%] h-[85%] object-contain transform group-hover:scale-110 transition-transform duration-500 ease-out"
      />

      {/* Discount Badge - Top Left */}
      <div className="absolute top-1 left-1 z-10 scale-90 sm:scale-100 origin-top-left">
        <div className="relative">
          <svg width="42" height="42" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
            <path d="M24 0L27.9 5.7L34.5 4.5L36.3 11.1L42.9 12.9L41.7 19.5L47.4 23.4L41.7 27.3L42.9 33.9L36.3 35.7L34.5 42.3L27.9 41.1L24 46.8L20.1 41.1L13.5 42.3L11.7 35.7L5.1 33.9L6.3 27.3L0.6 23.4L6.3 19.5L5.1 12.9L11.7 11.1L13.5 4.5L20.1 5.7L24 0Z" fill={themeColor || "#8B5CF6"} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white leading-none">
            <span className="text-[10px] font-black">{product.discount}</span>
            <span className="text-[7px] font-black uppercase">OFF</span>
          </div>
        </div>
      </div>

      {/* New Tag - Top Right */}
      {product.isNew && (
        <div className="absolute top-2 right-2 z-10 bg-[#FF5C5C] text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow-sm border border-white/20">
          NEW
        </div>
      )}

      {/* Liked Heart Icon */}
      <button className="absolute bottom-2 right-2 p-1.5 bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
        <Heart size={14} className="text-[#FF725E] fill-current" />
      </button>
    </div>

    {/* Product Details */}
    <div className="p-3 flex flex-col flex-1">
      <div className="flex-1 space-y-1">
        <h3 className="text-[13px] sm:text-[14px] font-[700] text-[#101828] dark:text-gray-100 line-clamp-2 break-words leading-[1.2] tracking-tight min-h-[32px] sm:min-h-[36px] overflow-hidden">
          {product.name}
        </h3>
        <p className="text-[11px] font-bold text-slate-500 dark:text-gray-400">
          {product.weight}
        </p>
      </div>

      {/* Price and Add Button */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className={`font-black text-[#101828] dark:text-white leading-none ${product.price > 9999 ? 'text-sm' : 'text-base'}`}>
            ₹{product.price}
          </span>
          {product.originalPrice && (
            <span className="text-[11px] text-slate-400 line-through font-bold mt-0.5">
              ₹{product.originalPrice}
            </span>
          )}
        </div>
        <div className="flex-shrink-0">
          <AddToCartButton
            item={{
              ...product,
              restaurant: "Hibermart",
              restaurantId: "hibermart-id"
            }}
            className="w-[50px] sm:w-[60px]"
          />
        </div>
      </div>
    </div>
  </div>
);

const CategoryCard = ({ category, onClick, themeColor }) => (
  <motion.button
    onClick={onClick}
    className="relative flex flex-col items-center rounded-[1.8rem] sm:rounded-[2.4rem] p-3.5 sm:p-4 overflow-hidden aspect-[0.78/1] transition-all border border-white/10"
    style={{
      background: `linear-gradient(180deg, ${themeColor}cc 0%, ${themeColor}66 100%)`,
      boxShadow: `0 15px 30px -15px rgba(0,0,0,0.12)`,
    }}
  >
    {/* Category Name Area - Fixed Height for Stability */}
    <div className="w-full h-[2.6rem] sm:h-[3rem] flex items-center justify-center mb-2 px-1">
      <span className="text-[11px] sm:text-[15px] font-black text-white text-center leading-tight tracking-tight drop-shadow-sm uppercase line-clamp-2">
        {category.name}
      </span>
    </div>

    {/* White House-Shaped Image Container (Inside Colored Card) */}
    <div
      className="flex-1 w-full flex items-center justify-center p-1.5 sm:p-2 overflow-hidden shadow-inner bg-white"
      style={{
        clipPath: 'polygon(0% 100%, 100% 100%, 100% 25%, 50% 0%, 0% 25%)',
        borderRadius: '0 0 1.5rem 1.5rem'
      }}
    >
      <img
        src={category.image}
        alt={category.name}
        className="w-[90%] h-[90%] object-contain transition-transform duration-500 ease-out"
      />
    </div>

    {/* Elegant Shine Overlay */}
    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent opacity-0 transition-opacity duration-500" />
  </motion.button>
);

const ProductSection = ({ title, products, onSeeAll, isNewlyLaunched = false, themeColor }) => {
  // Ensure all products have id field mapped from _id
  const productsWithIds = products.map(product => ({
    ...product,
    id: product.id || product._id?.toString() || product._id
  }));

  return (
    <div className="mb-8">
      <div className="bg-white dark:bg-white/5 rounded-[2rem] sm:rounded-[3rem] p-4 sm:p-7 md:p-8 lg:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100/50 dark:border-white/5">
        <div className="flex items-center justify-between mb-6 sm:mb-8 md:mb-10 px-1">
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {title}
          </h2>
          <button
            onClick={onSeeAll}
            style={{ color: themeColor }}
            className="font-bold text-sm sm:text-base hover:opacity-80 transition-opacity"
          >
            See all
          </button>
        </div>
        <div className="relative">
          <div
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-hide pb-2 px-1"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {productsWithIds.map((product) => (
              isNewlyLaunched ? (
                <NewlyLaunchedCard key={product.id} product={product} themeColor={themeColor} />
              ) : (
                <ProductCard key={product.id} product={product} themeColor={themeColor} />
              )
            ))}
            <div className="min-w-[4px] h-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
const AnimatedCategoryHeader = ({ categoryName }) => {
  return (
    <div className="relative w-full flex flex-col items-center justify-center py-4 md:py-6 mb-2 text-center select-none overflow-visible">
      {/* Cinematic Snow Shower Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {[...Array(25)].map((_, i) => (
          <motion.div
            key={`snow-${i}`}
            initial={{
              top: "-5%",
              left: `${Math.random() * 100}%`,
              opacity: 0,
              scale: 0.2 + Math.random() * 0.5
            }}
            animate={{
              top: "105%",
              left: [`${Math.random() * 100}%`, `${(Math.random() * 100) + (Math.random() > 0.5 ? 5 : -5)}%`],
              opacity: [0, 0.8, 0.8, 0],
            }}
            transition={{
              duration: 4 + Math.random() * 6,
              repeat: Infinity,
              delay: Math.random() * 10,
              ease: "linear"
            }}
            style={{
              position: 'absolute',
              width: `${Math.random() * 6 + 2}px`,
              height: `${Math.random() * 6 + 2}px`,
              background: 'white',
              borderRadius: '50%',
              filter: 'blur(1px) drop-shadow(0 0 2px rgba(255,255,255,0.8))'
            }}
          />
        ))}
      </div>

      <style>
        {`
          @keyframes ropeSway {
            0%, 100% { transform: rotate(-2deg); transform-origin: top center; }
            50% { transform: rotate(2deg); transform-origin: top center; }
          }
          .hanging-rope {
            animation: ropeSway 4s ease-in-out infinite;
          }
        `}
      </style>

      {/* Hanging Decorations - Left and Right */}
      {['left-2 sm:left-4 md:left-8', 'right-2 sm:right-4 md:right-8'].map((pos, idx) => (
        <div
          key={idx}
          className={`absolute top-[-20%] h-[150%] flex flex-col items-center pointer-events-none z-20 hanging-rope ${pos}`}
          style={{ animationDelay: `${idx * 1.5}s` }}
        >
          {/* Main Rope Line */}
          <div className="w-[1.5px] h-full bg-gradient-to-b from-white/0 via-white/30 to-white/0 shadow-[0_0_8px_rgba(255,255,255,0.2)]" />

          {/* Decorative Elements on Rope */}
          <div className="absolute inset-x-0 top-0 h-full flex flex-col items-center gap-12 sm:gap-20 pt-10">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-white/40 shadow-[0_0_10px_rgba(255,255,255,0.5)] border border-white/20" />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                >
                  <Sparkles
                    size={i % 2 === 0 ? 14 : 20}
                    className={i % 2 === 0 ? "text-white/60" : "text-yellow-200/80"}
                    fill="currentColor"
                  />
                </motion.div>
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white/30" />
              </div>
            ))}
          </div>
        </div>
      ))}

      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,900;1,400;1,900&family=Cinzel:wght@400;700;900&display=swap');
          
          @keyframes shimmerSweep {
            0% { background-position: -150% 0; }
            20% { background-position: 150% 0; }
            100% { background-position: 150% 0; }
          }

          @keyframes windWave {
            0%, 100% { transform: translate(0, 0) skewX(0deg); }
            25% { transform: translate(3px, -2px) skewX(2deg); }
            50% { transform: translate(0px, 1px) skewX(-1deg); }
            75% { transform: translate(-2px, -1px) skewX(1deg); }
          }

          .wind-char {
            display: inline-block;
            animation: windWave 4s ease-in-out infinite;
          }
        `}
      </style>

      {/* "THE" Above the main heading - Reduced Margin */}
      <motion.span
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-[10px] sm:text-[14px] md:text-[16px] font-black tracking-[0.6em] uppercase mb-1 text-white/80 z-20"
        style={{ fontFamily: "'Cinzel', serif" }}
      >
        THE
      </motion.span>

      {/* Main Heading Container */}
      <div className="relative w-full flex justify-center items-center">
        {/* Base White Title with Wind Wave Stagger */}
        <motion.h2
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(1.8rem, 7vw, 6rem)",
            lineHeight: "1.05"
          }}
          className="font-[1000] italic tracking-tightest text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)] relative px-2 whitespace-nowrap z-10"
        >
          {`${categoryName} Store`.split('').map((char, i) => (
            <span
              key={i}
              className="wind-char"
              style={{
                animationDelay: `${i * 0.1}s`,
                whiteSpace: char === ' ' ? 'pre' : 'normal'
              }}
            >
              {char}
            </span>
          ))}

          {/* Golden Splash & White Glint Overlay with synchronized Wind Wave */}
          <motion.span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'block',
              padding: '0 0.5rem',
              background: 'linear-gradient(110deg, transparent 35%, rgba(255,215,0,0.4) 42%, #FFD700 48%, #FFFFFF 50%, #FFD700 52%, rgba(255,215,0,0.4) 58%, transparent 65%)',
              backgroundSize: '300% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              zIndex: 20,
              animation: 'shimmerSweep 5s infinite linear'
            }}
            className="filter brightness-150 saturate-200 pointer-events-none"
          >
            {`${categoryName} Store`.split('').map((char, i) => (
              <span
                key={`gold-${i}`}
                className="wind-char"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  whiteSpace: char === ' ' ? 'pre' : 'normal'
                }}
              >
                {char}
              </span>
            ))}
          </motion.span>
        </motion.h2>

        {/* Limited Sparkles - Reduced count to 4 for premium feel */}
        <div className="absolute inset-0 pointer-events-none z-30">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1, 0.5],
                y: [0, -40 - Math.random() * 30],
                x: [(i % 2 === 0 ? 20 : -20) * Math.random(), (i % 2 === 0 ? 40 : -40) * Math.random()],
                rotate: [0, 90]
              }}
              transition={{
                duration: 2.5 + Math.random() * 2,
                repeat: Infinity,
                delay: i * 0.8,
                ease: "easeInOut"
              }}
              className="absolute"
              style={{
                left: `${20 + i * 20}%`,
                top: `30%`,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="drop-shadow-[0_0_5px_rgba(255,215,0,0.5)]"
              >
                <path d="M12 0L14 10L24 12L14 14L12 24L10 14L0 12L10 10L12 0Z" fill={i % 2 === 0 ? "#FFD700" : "#FFF"} />
              </svg>
            </motion.div>
          ))}
        </div>

        {/* Atmospheric Glow */}
        <div className="absolute inset-0 -z-10 bg-yellow-500/5 blur-[80px] rounded-full pointer-events-none" />
      </div>
    </div>
  );
};
const VoiceSearchModal = ({ isOpen, onClose, onResult }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [errorStatus, setErrorStatus] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setIsListening(false);
      setTranscript("");
      setErrorStatus(null);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorStatus("Speech recognition not supported");
      console.error("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setErrorStatus(null);
    };

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const resultTranscript = event.results[current][0].transcript;
      setTranscript(resultTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (transcript && !errorStatus) {
        onResult(transcript);
        // Delay closing slightly so user can see what was captured
        setTimeout(onClose, 800);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);

      if (event.error === 'not-allowed') {
        setErrorStatus("Microphone access denied. Please enable it in your browser settings.");
      } else if (event.error === 'no-speech') {
        setErrorStatus("No speech detected. Try again.");
      } else {
        setErrorStatus("An error occurred. Please try again.");
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition", e);
      setErrorStatus("Failed to start voice search");
    }

    return () => {
      recognition.stop();
    };
  }, [isOpen, onClose, onResult, transcript, errorStatus]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] p-8 flex flex-col items-center relative overflow-hidden shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>

            <div className="text-xl font-medium text-gray-400 mb-12 flex items-center gap-1">
              <span className="text-blue-500 font-bold">G</span>
              <span className="text-red-500 font-bold">o</span>
              <span className="text-yellow-500 font-bold">o</span>
              <span className="text-blue-500 font-bold">g</span>
              <span className="text-green-500 font-bold">l</span>
              <span className="text-red-500 font-bold">e</span>
            </div>

            <div className="relative mb-12">
              {/* Pulsing rings */}
              {isListening && !errorStatus && (
                <>
                  <motion.div
                    animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute inset-0 bg-blue-100 rounded-full"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                    className="absolute inset-0 bg-blue-50 rounded-full"
                  />
                </>
              )}

              <div className={`relative w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-colors ${errorStatus ? 'bg-red-400 shadow-red-100' : 'bg-blue-500 shadow-blue-200'}`}>
                <Mic size={40} className="text-white" strokeWidth={2.5} />
              </div>
            </div>

            <h2 className={`text-2xl font-semibold mb-3 text-center px-4 ${errorStatus ? 'text-red-500' : (transcript ? 'text-gray-800' : 'text-gray-400')}`}>
              {errorStatus || transcript || "Speak now"}
            </h2>

            <p className="text-gray-400 text-lg mb-12 font-medium">
              {errorStatus ? "Permission Required" : "English (United States)"}
            </p>

            <div className="w-full bg-gray-50 rounded-3xl p-6 text-center border border-gray-100">
              <p className="text-gray-500 text-sm leading-relaxed font-medium">
                {errorStatus
                  ? "To use voice search, please click the camera/mic icon in your address bar and allow microphone access."
                  : "Google Speech Services converts audio to text and shares the text with this app."}
              </p>
            </div>

            {errorStatus && (
              <button
                onClick={onClose}
                className="mt-6 w-full py-4 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-colors"
              >
                Got it
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const InMartSearchOverlay = ({ isOpen, onClose, allProducts, searchCategories, themeColor, initialSearch }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch || "");
  const [results, setResults] = useState({ products: [], categories: [] });
  const navigate = useNavigate();

  useEffect(() => {
    setSearchTerm(initialSearch || "");
  }, [initialSearch]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults({ products: [], categories: [] });
      return;
    }

    const lowerTerm = searchTerm.toLowerCase();

    // Local Search First
    const filteredCategories = searchCategories.filter(cat =>
      cat.name?.toLowerCase().includes(lowerTerm) ||
      cat.slug?.toLowerCase().includes(lowerTerm)
    );

    const filteredProducts = allProducts.filter(prod => {
      const nameMatch = prod.name?.toLowerCase().includes(lowerTerm);
      const descMatch = prod.description?.toLowerCase().includes(lowerTerm);
      const catMatch = prod.category?.toLowerCase().includes(lowerTerm) || prod.categoryName?.toLowerCase().includes(lowerTerm);
      const subCatMatch = prod.subCategory?.toLowerCase().includes(lowerTerm) || prod.subCategoryName?.toLowerCase().includes(lowerTerm);

      return nameMatch || descMatch || catMatch || subCatMatch;
    });

    setResults({ products: filteredProducts, categories: filteredCategories });

    // Live API Search for deeper catalog coverage
    const fetchLiveResults = async () => {
      try {
        const res = await inmartAPI.getProducts({ search: searchTerm, limit: 20 });
        if (res.success && res.data.products) {
          setResults(prev => {
            const existingIds = new Set(prev.products.map(p => p.id || p._id));
            const newProducts = res.data.products.filter(p => !existingIds.has(p.id || p._id));
            return {
              ...prev,
              products: [...prev.products, ...newProducts.map(p => ({ ...p, id: p.id || p._id }))]
            };
          });
        }
      } catch (err) {
        console.error("Live search error:", err);
      }
    };

    const timeoutId = setTimeout(fetchLiveResults, 400);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, allProducts, searchCategories]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="fixed inset-0 z-[100] bg-white dark:bg-[#0a0a0a] flex flex-col pt-safe"
    >
      {/* Search Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white dark:bg-[#0a0a0a] z-10 shadow-sm">
        <button
          onClick={() => {
            setSearchTerm("");
            onClose();
          }}
          className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        </button>
        <div className="flex-1 relative group">
          <input
            autoFocus
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder='Search products or categories...'
            className="w-full h-12 pl-4 pr-12 bg-gray-50 dark:bg-white/5 border border-transparent focus:border-[#E7D1FF] rounded-2xl outline-none text-base font-medium transition-all"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full text-gray-400 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-6">
        {searchTerm ? (
          <div className="space-y-8 max-w-7xl mx-auto">
            {/* Category Suggestions */}
            {results.categories.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 px-1">Categories</h3>
                <div className="flex flex-col gap-1">
                  {results.categories.map((subCat) => (
                    <button
                      key={subCat.id || subCat.slug}
                      onClick={() => {
                        onClose();
                        navigate(`/food/user/in-mart/products/${subCat.slug || subCat.id}`);
                      }}
                      className="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-2xl transition-all group"
                    >
                      <div className="w-12 h-12 bg-gray-50 dark:bg-white/10 rounded-xl overflow-hidden p-1.5 flex items-center justify-center border border-gray-100 dark:border-white/5">
                        <img
                          src={subCat.image || "https://via.placeholder.com/200"}
                          alt={subCat.name}
                          className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <div className="flex flex-col items-start leading-tight">
                        <span className="font-bold text-gray-800 dark:text-gray-200">{subCat.name}</span>
                        <span className="text-xs text-gray-400">View Category</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Product Results */}
            {results.products.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Showing results for "{searchTerm}"</h3>
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-white/5 px-2 py-1 rounded-md">{results.products.length} Items</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                  {results.products.map((product) => (
                    <ProductCard key={product.id || product._id} product={product} themeColor={themeColor} />
                  ))}
                </div>
              </div>
            ) : (
              results.categories.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-24 h-24 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <Search className="w-10 h-10 text-gray-300" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">No results found</h3>
                  <p className="text-gray-400">We couldn't find anything matching "{searchTerm}"</p>
                </div>
              )
            )}
          </div>
        ) : (
          /* Initial Search State (e.g. Popular or Recent) */
          <div className="flex flex-col items-center justify-center py-32 opacity-40">
            <Search size={64} strokeWidth={1} className="mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-400 tracking-tight">Search for fresh essentials...</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const PartyCelebration = () => {
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrigger(prev => prev + 1);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-visible" key={trigger}>
      {[...Array(40)].map((_, i) => {
        const colors = ['#FFD700', '#FF69B4', '#00CED1', '#ADFF2F', '#FFA500', '#FF4500'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 6 + Math.random() * 8;

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0, x: "-50%", y: "20%" }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0.5, 1.2, 0.7],
              x: ["-50%", `calc(-50% + ${(Math.random() - 0.5) * 600}px)`],
              y: ["20%", `calc(20% - ${150 + Math.random() * 350}px)`],
              rotate: [0, Math.random() * 720]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              ease: "easeOut"
            }}
            className="absolute left-1/2 top-1/2"
            style={{
              width: `${size}px`,
              height: Math.random() > 0.5 ? `${size}px` : `${size * 1.5}px`,
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              boxShadow: `0 0 10px ${color}40`
            }}
          />
        );
      })}
    </div>
  );
};

export default function InMart() {
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [inlineProducts, setInlineProducts] = useState([])
  const [isInlineLoading, setIsInlineLoading] = useState(false)

  // API Data State
  const [apiData, setApiData] = useState({
    allCategories: [],
    collections: [],
    banners: [],
    stories: [],
    navigation: [],
    store: null
  })
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const [currentCategoryBannerIndex, setCurrentCategoryBannerIndex] = useState(0)

  // Filter banners by type
  const heroBanners = useMemo(() =>
    apiData.banners?.filter(b => b.type === 'Hero' || !b.type) || [],
    [apiData.banners]
  );

  const categoryBanners = useMemo(() =>
    apiData.banners?.filter(b => b.type === 'Category') || [],
    [apiData.banners]
  );

  useEffect(() => {
    if (heroBanners && heroBanners.length > 1) {
      const interval = setInterval(() => {
        setCurrentBannerIndex((prev) => (prev + 1) % heroBanners.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [heroBanners]);

  // Auto-scroll category banners
  useEffect(() => {
    if (categoryBanners && categoryBanners.length > 1) {
      const interval = setInterval(() => {
        setCurrentCategoryBannerIndex((prev) => (prev + 1) % categoryBanners.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [categoryBanners]);

  // Fetch InMart data from API
  useEffect(() => {
    const fetchInMartData = async () => {
      try {
        setIsLoading(true)
        const [homeRes, navRes] = await Promise.all([
          inmartAPI.getInMartHome(),
          inmartAPI.getNavCategories()
        ]);

        if (homeRes.success && navRes.success) {
          setApiData({
            ...homeRes.data,
            allCategories: homeRes.data.categories,
            navigation: navRes.data.navigation
          })
          console.log('✅ InMart data loaded:', homeRes.data, navRes.data)
        } else {
          setApiError(homeRes.message || navRes.message)
        }
      } catch (error) {
        console.error('❌ Error fetching InMart data:', error)
        setApiError(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchInMartData()
  }, [])

  const iconMap = { ShoppingBag, Home, Gamepad2, Apple, Headphones, Smartphone, Sparkles, Shirt, Coffee, Compass };

  const categoriesData = useMemo(() => {
    const base = [
      { id: "all", name: "All", icon: ShoppingBag, color: "#8B5CF6", themeColor: "#D3AEFE", slug: "all" }
    ];

    if (!apiData.navigation || apiData.navigation.length === 0) return base;

    const dynamic = apiData.navigation.map(n => ({
      id: n._id,
      name: n.name,
      icon: iconMap[n.icon] || ShoppingBag,
      themeColor: n.themeColor || "#D3AEFE",
      color: n.themeColor || "#8B5CF6",
      slug: n.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      targetType: n.targetType,
      targetId: n.targetId,
      featuredCategories: n.featuredCategories || []
    }));

    return [...base, ...dynamic];
  }, [apiData.navigation]);

  // Fetch inline products when active category changes
  useEffect(() => {
    const activeData = categoriesData.find(c => c.name === activeCategory);
    if (!activeData || activeData.name === "All") {
      setInlineProducts([]);
      return;
    }

    const fetchInlineData = async () => {
      try {
        setIsInlineLoading(true);
        let products = [];
        if (activeData.targetType === 'category') {
          const res = await inmartAPI.getProducts({ category: activeData.targetId });
          products = res.data.products;
        } else if (activeData.targetType === 'collection') {
          const res = await inmartAPI.getCollectionBySlug(activeData.targetId);
          products = res.data.collection.products;
        }
        setInlineProducts(products);
      } catch (err) {
        console.error("Error fetching inline products:", err);
      } finally {
        setIsInlineLoading(false);
      }
    }

    fetchInlineData();
  }, [activeCategory, categoriesData]);

  const activeCategoryData = useMemo(() => {
    const found = categoriesData.find(cat => cat.name === activeCategory);
    return found || categoriesData[0] || { color: "#8B5CF6", themeColor: "#D3AEFE" };
  }, [activeCategory, categoriesData]);

  const [showSplash, setShowSplash] = useState(true)
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState(false)
  const [isInMartSearchOpen, setIsInMartSearchOpen] = useState(false)

  const allProducts = useMemo(() => {
    const productsMap = new Map();

    const addProductsFromCatalog = (items) => {
      if (!items) return;
      items.forEach(item => {
        // Add direct products
        item.products?.forEach(product => {
          const id = product.id || product._id?.toString() || product._id;
          if (id && !productsMap.has(id)) {
            productsMap.set(id, { ...product, id });
          }
        });
        // Recurse into sub-categories
        if (item.subCategories) {
          addProductsFromCatalog(item.subCategories);
        }
      });
    };

    // 1. Add products from collections (Sale, Best Sellers, etc.)
    apiData.collections?.forEach(collection => {
      collection.products?.forEach(product => {
        const id = product.id || product._id?.toString() || product._id;
        if (id && !productsMap.has(id)) {
          productsMap.set(id, { ...product, id });
        }
      });
    });

    // 2. Add products from all levels of the category tree
    addProductsFromCatalog(apiData.allCategories);

    // 3. Add any currently loaded inline products from the category store
    inlineProducts?.forEach(product => {
      const id = product.id || product._id?.toString() || product._id;
      if (id && !productsMap.has(id)) {
        productsMap.set(id, { ...product, id });
      }
    });

    return Array.from(productsMap.values());
  }, [apiData.collections, apiData.allCategories, inlineProducts]);

  const searchCategories = useMemo(() => {
    const categories = [];
    const collectSubCategories = (items) => {
      if (!items) return;
      items.forEach(item => {
        if (item.subCategories) {
          item.subCategories.forEach(sub => {
            categories.push(sub);
            collectSubCategories([sub]);
          });
        }
      });
    };

    collectSubCategories(apiData.allCategories);
    return categories;
  }, [apiData.allCategories]);
  const { userProfile, addresses } = useProfile()
  const defaultAddress = addresses?.find(a => a.isDefault) || addresses?.[0] || { addressLine1: "Detecting Location..." }

  useEffect(() => {
    // Hide splash after 2.5 seconds
    const timer = setTimeout(() => {
      setShowSplash(false)
    }, 2500)
    return () => clearTimeout(timer)
  }, [])


  // Zepto-style rotating placeholder
  const placeholderItems = useMemo(() => [
    'Search for "Milk"',
    'Search for "Bread"',
    'Search for "Eggs"',
    'Search for "Curd"',
    'Search for "Atta"',
    'Search for "Oil"',
    'Search for "Sugar"',
    'Search for "Tea"',
    'Search for "Coffee"',
  ], [])
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholderItems.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [placeholderItems.length])

  const { openSearch, closeSearch, setSearchValue } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()

  const [inMartHeroBanner, setInMartHeroBanner] = useState(null)

  useEffect(() => {
    const fetchInMartHeroBanner = async () => {
      try {
        const response = await api.get('/hero-banners/dining/public')
        if (response.data.success && response.data.data.banners && response.data.data.banners.length > 0) {
          setInMartHeroBanner(response.data.data.banners[0])
        }
      } catch (error) {
        console.error("Failed to fetch in-mart hero banner", error)
      }
    }
    fetchInMartHeroBanner()
  }, [])


  const handleSearchFocus = useCallback(() => {
    setIsInMartSearchOpen(true)
  }, [])



  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: { duration: 0.5, ease: "easeInOut" }
            }}
            className="fixed inset-0 z-[10001] bg-[#8B5CF6] flex flex-col items-center justify-center p-6"
          >
            {/* Top Section: Animated M Logo (Midway between top and middle) */}
            <div className="absolute top-[25%] -translate-y-1/2 flex flex-col items-center">
              <div className="relative">
                <motion.div
                  initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    delay: 0.1
                  }}
                  className="relative"
                >
                  {/* Custom SVG for Swiggy-like Pin Shape */}
                  <svg width="150" height="150" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl">
                    <path
                      d="M50 0C22.3858 0 0 22.3858 0 50C0 67.4552 9.42149 82.6826 23.5113 91.0776L50 100L76.4887 91.0776C90.5785 82.6826 100 67.4552 100 50C100 22.3858 77.6142 0 50 0Z"
                      fill="white"
                    />
                    <text
                      x="50"
                      y="62"
                      textAnchor="middle"
                      fill="#8B5CF6"
                      fontSize="55"
                      fontWeight="1000"
                      fontStyle="italic"
                      className="select-none"
                      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                      M
                    </text>
                  </svg>

                  {/* Glow Effect */}
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.1, 0.3, 0.1]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute inset-0 bg-white rounded-full blur-3xl -z-10"
                  />
                </motion.div>
              </div>
            </div>

            {/* Middle Section: Branding (Middle of page) */}
            <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center text-white/90">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-[1000] italic tracking-tightest uppercase"
              >
                Hibermart
              </motion.div>
            </div>

            {/* Bottom Section: Tagline */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
              className="absolute bottom-16 flex flex-col items-center"
            >
              <h2 className="text-white text-3xl sm:text-4xl font-[1000] italic tracking-tightest uppercase text-center drop-shadow-lg">
                Freshness at <br />
                <span className="text-white/90">your doorstep</span>
              </h2>
              <div className="flex gap-1.5 mt-6">
                <motion.div
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                  className="w-2 h-2 bg-white rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-white/60 rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-white/30 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatedPage
        className="bg-white dark:bg-[#0a0a0a] scrollbar-hide"
        style={{
          minHeight: '100vh',
          paddingBottom: '80px',
          overflowY: 'auto',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none'
        }}
      >
        <style>
          {`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}
        </style>
        {/* Unified Navbar & Hero Section */}
        <div
          className="relative w-full overflow-hidden lg:min-h-[35vh] md:pt-4 transition-colors duration-500 ease-in-out"
          style={{
            background: `linear-gradient(180deg, ${activeCategoryData.themeColor} 0%, ${activeCategoryData.themeColor}33 100%)`
          }}
        >

          {/* Navbar */}
          <div className="relative z-20 pt-1 sm:pt-3 lg:pt-4">
            <PageNavbar
              textColor="black"
              zIndex={20}
            />
          </div>

          {/* Hero Section with Search */}
          <section className="relative z-20 w-full px-4 sm:px-6 lg:px-8 xl:px-12 mt-4 sm:mt-6 md:mt-8 py-4 sm:py-8">
            <div className="max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto">
              <div className="relative w-full overflow-hidden">
                <div className="flex items-center gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                  {/* Search Input Container */}
                  <div
                    className="relative flex-1 group cursor-pointer"
                    onClick={() => setIsInMartSearchOpen(true)}
                  >
                    <Search className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-[#8B5CF6] transition-colors w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} />
                    <div className="w-full h-12 sm:h-14 md:h-16 bg-white dark:bg-[#1a1a1a] border-2 border-transparent group-hover:border-[#E7D1FF] rounded-2xl sm:rounded-[1.25rem] pl-12 sm:pl-14 pr-12 flex items-center shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all">
                      <span className="text-gray-400 dark:text-gray-500 text-sm sm:text-base md:text-lg font-medium select-none truncate">
                        {placeholderItems[placeholderIndex]}
                      </span>
                    </div>
                    <Mic
                      className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#8B5CF6] transition-colors w-5 h-5 sm:w-6 sm:h-6 cursor-pointer z-10"
                      strokeWidth={2.5}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsVoiceSearchOpen(true);
                      }}
                    />
                  </div>

                  {/* Trending Deals Toggle - Hidden on mobile, shown on md+ */}
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="hidden md:flex flex-shrink-0 h-14 md:h-16 px-6 lg:px-8 rounded-2xl sm:rounded-[1.25rem] bg-white dark:bg-[#1a1a1a] shadow-[0_4px_20px_rgba(0,0,0,0.04)] items-center gap-3 border-2 border-transparent hover:border-[#FFEDEB] transition-all"
                  >
                    <div className="p-2 bg-[#FFEDEB] dark:bg-[#FFEDEB]/10 rounded-xl">
                      <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#FF725E]" strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-[#FF725E] font-black text-[10px] lg:text-xs tracking-tighter uppercase italic">Trending</span>
                      <span className="text-[#FF725E] font-black text-sm lg:text-xl tracking-tighter uppercase italic">Deals</span>
                    </div>
                  </motion.button>
                </div>
              </div>
            </div>
          </section>

          {/* Categories Section */}
          <section className="relative z-20 w-full mt-1 sm:mt-2 pb-2 px-0 overflow-hidden">
            {/* Subtle Snow Shower Background for Navigation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
              {[...Array(15)].map((_, i) => (
                <motion.div
                  key={`nav-snow-${i}`}
                  initial={{
                    top: "-10%",
                    left: `${Math.random() * 100}%`,
                    opacity: 0,
                    scale: 0.1 + Math.random() * 0.4
                  }}
                  animate={{
                    top: "110%",
                    left: [`${Math.random() * 100}%`, `${(Math.random() * 100) + (Math.random() > 0.5 ? 3 : -3)}%`],
                    opacity: [0, 0.4, 0.4, 0],
                  }}
                  transition={{
                    duration: 6 + Math.random() * 8,
                    repeat: Infinity,
                    delay: Math.random() * 10,
                    ease: "linear"
                  }}
                  style={{
                    position: 'absolute',
                    width: `${Math.random() * 4 + 1}px`,
                    height: `${Math.random() * 4 + 1}px`,
                    background: 'white',
                    borderRadius: '50%',
                    filter: 'blur(0.5px) drop-shadow(0 0 1px rgba(255,255,255,0.5))'
                  }}
                />
              ))}
            </div>

            <div className="max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto relative z-10">
              <div
                className="flex items-center gap-4 sm:gap-6 md:gap-8 overflow-x-auto scrollbar-hide pb-1 px-4 sm:px-6 lg:px-8 xl:px-12"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {categoriesData.map((cat) => {
                  const isActive = activeCategory === cat.name;
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        if (cat.name === "All" || cat.name === "Home" || cat.slug === "home") {
                          setActiveCategory(cat.name);
                        } else if (cat.targetType === "external") {
                          window.open(cat.targetId, "_blank");
                        } else {
                          setActiveCategory(cat.name);
                        }
                      }}
                      className="flex flex-col items-center gap-1 sm:gap-2 group relative pb-3 px-1 transition-all hover:translate-y-[-2px] min-w-[60px] sm:min-w-[80px]"
                    >
                      <div
                        className="p-2 sm:p-3 transition-all shadow-sm flex items-center justify-center overflow-hidden"
                        style={{
                          backgroundColor: isActive ? 'white' : 'transparent',
                          clipPath: isActive ? 'polygon(50% 0%, 100% 35%, 100% 100%, 0 100%, 0 35%)' : 'none',
                          borderRadius: isActive ? '0' : '1.2rem'
                        }}
                      >
                        <Icon
                          className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8 mb-[-2px]" // Adjusted for house shape bottom heavy
                          color={isActive ? cat.themeColor : "black"}
                          strokeWidth={isActive ? 3.5 : 2.5}
                        />
                      </div>
                      <span
                        className={`text-[10px] sm:text-sm md:text-base font-bold transition-colors whitespace-nowrap text-center ${isActive ? 'opacity-100' : 'text-black opacity-60 group-hover:opacity-100'}`}
                        style={{ color: isActive ? cat.themeColor : undefined }}
                      >
                        {cat.name}
                      </span>
                      {isActive && (
                        <motion.div
                          layoutId="activeIndicator"
                          className="absolute bottom-0 left-0 right-0 h-1 rounded-full"
                          style={{ width: '100%', backgroundColor: cat.themeColor }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Banner Carousel or Inline Category Content */}
        {activeCategory === "All" ? (
          heroBanners.length > 0 && (
            <section className="relative z-20 w-full px-4 sm:px-6 lg:px-8 mt-4 sm:mt-6 overflow-hidden">
              <div className="max-w-7xl mx-auto relative group">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-purple-100 dark:border-white/10 bg-[#F3E8FF] aspect-[21/9] sm:aspect-[24/10]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentBannerIndex}
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.6, ease: "easeInOut" }}
                      className="absolute inset-0 w-full h-full cursor-pointer"
                      onClick={() => heroBanners[currentBannerIndex].linkUrl && (window.location.href = heroBanners[currentBannerIndex].linkUrl)}
                    >
                      <img
                        src={heroBanners[currentBannerIndex].imageUrl || heroBanners[currentBannerIndex].image}
                        alt={heroBanners[currentBannerIndex].title || "Promo Banner"}
                        className="w-full h-full object-cover block"
                      />

                      {/* Optional Overlay for better text visibility if we ever add text */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    </motion.div>
                  </AnimatePresence>

                  {/* Indicators/Dots */}
                  {heroBanners.length > 1 && (
                    <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-30">
                      {heroBanners.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentBannerIndex(idx);
                          }}
                          className={`transition-all duration-300 rounded-full ${currentBannerIndex === idx
                            ? "w-6 sm:w-8 h-1.5 sm:h-2 bg-white"
                            : "w-1.5 sm:w-2 h-1.5 sm:h-2 bg-white/50 hover:bg-white/80"
                            }`}
                          aria-label={`Go to banner ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )
        ) : (
          <section className="relative z-20 w-full px-4 sm:px-6 lg:px-8 mt-4 sm:mt-6">
            <div className="max-w-7xl mx-auto">
              {isInlineLoading ? (
                <div className="w-full aspect-[21/9] sm:aspect-[24/10] bg-gray-50 animate-pulse rounded-[2.5rem] flex items-center justify-center border border-gray-100">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-black/10 border-t-black rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Loading {activeCategory}...</span>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-[3rem] pt-10 pb-6 sm:pt-20 sm:pb-12 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.2)] border border-white/20 backdrop-blur-2xl transition-all relative overflow-hidden flex flex-col items-center text-center"
                  style={{
                    background: `radial-gradient(circle at center, ${activeCategoryData.themeColor} 0%, ${activeCategoryData.themeColor}dd 100%)`,
                  }}
                >
                  {/* Premium Glow Effects */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-white/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-black/30 rounded-full blur-[120px]" />
                  </div>

                  {/* Enhanced Floating Decorative Elements */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{
                          x: `${Math.random() * 100}%`,
                          y: `${Math.random() * 100}%`,
                          opacity: 0,
                          scale: 0
                        }}
                        animate={{
                          y: ["-10%", "110%"],
                          opacity: [0, 0.7, 0],
                          scale: [0.3, 1, 0.3],
                          rotate: Math.random() * 360
                        }}
                        transition={{
                          duration: 5 + Math.random() * 8,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: Math.random() * 5
                        }}
                        className="absolute"
                        style={{ color: i % 2 === 0 ? '#FFE082' : 'white' }}
                      >
                        {i % 3 === 0 ? <Sparkles size={16} /> : i % 3 === 1 ? <Heart size={14} fill="currentColor" /> : <div className="w-2 h-2 rounded-full bg-current opacity-60" />}
                      </motion.div>
                    ))}
                  </div>

                  <div className="relative z-10 w-full max-w-5xl">
                    <AnimatedCategoryHeader categoryName={activeCategory} />
                  </div>

                  {/* Horizontal Product Scroll */}
                  <div className="relative z-10 w-full mb-0 px-4 sm:px-6 lg:px-8">
                    {activeCategoryData.featuredCategories && activeCategoryData.featuredCategories.length > 0 ? (
                      <div className="grid grid-cols-3 gap-3 sm:gap-6 pb-12 transition-all">
                        {activeCategoryData.featuredCategories.flatMap((fc) => {
                          const mainCat = apiData.allCategories.find(c => c._id === fc.categoryId);
                          if (!mainCat) return [];
                          return mainCat.subCategories?.filter(s =>
                            fc.subCategoryIds.includes(s.slug || s.id)
                          ) || [];
                        }).slice(0, 6).map((sub, idx) => (
                          <CategoryCard
                            key={`${sub.slug || sub.id}-${idx}`}
                            category={sub}
                            themeColor={activeCategoryData.themeColor}
                            onClick={() => {
                              navigate(`/food/user/in-mart/products/${sub.slug || sub.id}`);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-4 sm:gap-6 md:gap-8 overflow-x-auto scrollbar-hide pb-6"
                        style={{
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                          WebkitOverflowScrolling: 'touch'
                        }}
                      >
                        {inlineProducts.length > 0 ? (
                          <>
                            {inlineProducts.map(p => (
                              <ProductCard key={p._id} product={p} themeColor={activeCategoryData.themeColor} />
                            ))}
                            <div className="min-w-[20px] sm:min-w-[40px] h-full" />
                          </>
                        ) : (
                          <div className="w-full py-32 text-center">
                            <div className="w-28 h-28 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-8 backdrop-blur-lg">
                              <ShoppingBag className="w-12 h-12 text-white/40" />
                            </div>
                            <p className="text-white font-black uppercase tracking-[0.3em] text-sm">Curating more products for the {activeCategory} Store...</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Special Price Interactive Banner */}
        <section className="relative z-20 w-full px-4 sm:px-6 lg:px-8 xl:px-12 mt-4 sm:mt-6 md:mt-8">
          <div className="max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full rounded-xl sm:rounded-2xl md:rounded-[1.5rem] py-3 sm:py-4 md:py-5 px-5 sm:px-8 md:px-10 flex items-center justify-start gap-4 sm:gap-6 shadow-sm hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
              style={{
                backgroundColor: `${activeCategoryData.themeColor}15`,
                border: `1.5px solid ${activeCategoryData.themeColor}33`
              }}
            >
              {/* Gold Coin Icon with Glint */}
              <div className="flex-shrink-0 w-8 h-8 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center shadow-inner border-[1.5px] border-yellow-200 relative overflow-hidden group-hover:rotate-12 transition-transform">
                <span className="text-white font-black text-lg sm:text-2xl md:text-3xl drop-shadow-sm relative z-10">₹</span>

                {/* Coin Glint Effect */}
                <motion.div
                  initial={{ x: '-150%', skewX: -20 }}
                  animate={{ x: '150%' }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 3,
                    ease: "easeInOut"
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full h-full"
                />
              </div>

              <div className="flex flex-col min-w-0 relative">
                <span
                  className="font-bold text-[12px] sm:text-xl md:text-2xl lg:text-3xl tracking-tighter uppercase leading-tight whitespace-nowrap"
                  style={{ color: activeCategoryData.themeColor }}
                >
                  Special Prices for your 1st order
                </span>

                {/* Golden Text Shimmer */}
                <motion.span
                  initial={{ backgroundPosition: '200% 0' }}
                  animate={{ backgroundPosition: '-200% 0' }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(110deg, transparent 30%, rgba(255, 215, 0, 0) 35%, rgba(255, 215, 0, 0.4) 45%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 215, 0, 0.4) 55%, rgba(255, 215, 0, 0) 65%, transparent 70%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    zIndex: 20,
                  }}
                  className="filter brightness-110 saturate-120 pointer-events-none font-bold text-[12px] sm:text-xl md:text-2xl lg:text-3xl tracking-tighter uppercase leading-tight whitespace-nowrap"
                >
                  Special Prices for your 1st order
                </motion.span>
              </div>

              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <ChevronRight
                  size={24}
                  className="md:w-8 md:h-8"
                  strokeWidth={3}
                  style={{ color: `${activeCategoryData.themeColor}66` }}
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Big Sale Section */}
        <section className="relative z-20 w-full px-4 sm:px-6 lg:px-8 xl:px-12 mt-6 sm:mt-10 md:mt-14 pb-10">
          <div className="max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="w-full rounded-[2rem] sm:rounded-[3rem] md:rounded-[4rem] overflow-hidden py-8 sm:py-12 md:py-16 px-4 sm:px-8 md:px-12 shadow-xl border border-purple-100/50 relative transition-colors duration-500 ease-in-out"
              style={{
                background: `linear-gradient(180deg, ${activeCategoryData.themeColor}80 0%, ${activeCategoryData.themeColor}40 100%)`,
                border: `1.5px solid ${activeCategoryData.themeColor}99`
              }}
            >
              {/* Sunburst Background Effect */}
              <div className="absolute top-[-50px] left-0 right-0 h-[400px] sm:h-[700px] md:h-[900px] overflow-hidden pointer-events-none flex items-center justify-center">
                <div
                  className="w-[1000px] h-[1000px] sm:w-[1600px] sm:h-[1600px] md:w-[2000px] md:h-[2000px] opacity-60 dark:opacity-30 animate-[spin_30s_linear_infinite]"
                  style={{
                    background: `conic-gradient(
                    from 0deg,
                    transparent 0deg, 
                    transparent 5deg, 
                    rgba(255,255,255,0.8) 10deg, 
                    rgba(255,255,255,0.8) 20deg, 
                    transparent 25deg, 
                    transparent 45deg, 
                    rgba(255,255,255,0.8) 50deg, 
                    rgba(255,255,255,0.8) 60deg, 
                    transparent 65deg,
                    transparent 100deg,
                    rgba(255,255,255,0.8) 110deg,
                    rgba(255,255,255,0.8) 120deg,
                    transparent 125deg,
                    transparent 180deg,
                    rgba(255,255,255,0.8) 190deg, 
                    rgba(255,255,255,0.8) 200deg, 
                    transparent 205deg, 
                    transparent 235deg, 
                    rgba(255,255,255,0.8) 240deg, 
                    rgba(255,255,255,0.8) 250deg, 
                    transparent 255deg,
                    transparent 300deg,
                    rgba(255,255,255,0.8) 310deg,
                    rgba(255,255,255,0.8) 320deg,
                    transparent 325deg
                  )`,
                    maskImage: 'radial-gradient(circle, black 25%, transparent 65%)',
                    WebkitMaskImage: 'radial-gradient(circle, black 25%, transparent 65%)',
                  }}
                />
              </div>

              {/* Section Header */}
              <div className="relative z-10 flex flex-col items-center mb-6 sm:mb-10 md:mb-14">
                <PartyCelebration />
                <motion.h2
                  initial={{ scale: 0.8, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  animate={{
                    scale: [1, 1.04, 1],
                  }}
                  transition={{
                    scale: {
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    },
                    opacity: { duration: 0.8 }
                  }}
                  viewport={{ once: true }}
                  className="text-5xl sm:text-8xl md:text-9xl lg:text-[11rem] font-[1000] text-white italic tracking-tighter flex flex-col items-center select-none relative"
                  style={{
                    WebkitTextStroke: '2px black',
                    textShadow: `
                    1px 1px 0px #000,
                    2px 2px 0px #000,
                    3px 3px 0px #000,
                    4px 4px 0px #000,
                    5px 5px 0px #000,
                    6px 6px 0px #000,
                    7px 7px 0px #000,
                    8px 8px 15px rgba(0,0,0,0.4)
                  `
                  }}
                >
                  <div className="flex items-center gap-x-[1px] sm:gap-x-1 relative">
                    <span className="flex relative z-10">
                      {"BIG SALE".split("").map((char, i) => (
                        <motion.span
                          key={i}
                          animate={{
                            y: [0, -20, 0],
                          }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            repeatDelay: 6,
                            delay: i * 0.1,
                            ease: "easeInOut"
                          }}
                          style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
                        >
                          {char}
                        </motion.span>
                      ))}
                    </span>

                    {/* Synchronized Gold Flash Layer */}
                    <span className="absolute inset-0 easy-gold-flash pointer-events-none z-20 flex">
                      {"BIG SALE".split("").map((char, i) => (
                        <motion.span
                          key={i}
                          animate={{
                            y: [0, -20, 0],
                          }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            repeatDelay: 6,
                            delay: i * 0.1,
                            ease: "easeInOut"
                          }}
                          style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : 'normal' }}
                        >
                          {char}
                        </motion.span>
                      ))}
                    </span>
                  </div>
                </motion.h2>
              </div>

              {/* Product Carousel */}
              <div className="relative mb-6 sm:mb-10 md:mb-14">
                <div
                  className="flex items-center gap-4 sm:gap-6 md:gap-8 overflow-x-auto scrollbar-hide pb-4 px-1"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {(apiData.collections?.find(c => c.slug === 'sale')?.products || []).map((product) => {
                    // Ensure product has id field mapped from _id
                    const productWithId = {
                      ...product,
                      id: product.id || product._id?.toString() || product._id
                    };
                    return <ProductCard key={productWithId.id} product={productWithId} themeColor={activeCategoryData.themeColor} />;
                  })}
                  <div className="min-w-[4px] h-full"></div>
                </div>
              </div>

              {/* See All Button */}
              <div className="mt-0 px-2 sm:px-4 md:px-8 lg:px-12">
                <motion.button
                  whileHover={{
                    scale: 1.01,
                    y: -2,
                    background: `linear-gradient(180deg, #ffffff 0%, ${activeCategoryData.themeColor}22 100%)`
                  }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate('/in-mart/section/sale')}
                  className="w-full max-w-2xl mx-auto text-gray-900 dark:text-white font-bold py-4 sm:py-5 md:py-6 rounded-2xl md:rounded-3xl flex items-center justify-center gap-3 text-base sm:text-xl lg:text-2xl transition-all shadow-md border border-black/10"
                  style={{
                    background: `linear-gradient(180deg, #ffffff 0%, ${activeCategoryData.themeColor}11 100%)`
                  }}
                >
                  See all
                  <ChevronRight size={24} className="stroke-[4px]" />
                </motion.button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Content */}
        <div className="max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-2 sm:pt-4 md:pt-6 lg:pt-8 pb-10">
          <ProductSection
            title="Newly Launched"
            products={apiData.collections?.find(c => c.slug === 'newly-launched')?.products || []}
            onSeeAll={() => navigate('/in-mart/section/newly-launched')}
            isNewlyLaunched={true}
            themeColor={activeCategoryData.themeColor}
          />

          <ProductSection
            title="Best Sellers"
            products={apiData.collections?.find(c => c.slug === 'best-sellers')?.products || []}
            onSeeAll={() => navigate('/in-mart/section/best-sellers')}
            themeColor={activeCategoryData.themeColor}
          />

          {/* Category Banner Section (Carousel Style) */}
          {activeCategory === "All" && categoryBanners.length > 0 && (
            <section className="relative z-20 w-full mb-8 overflow-hidden">
              <div className="relative group">
                <div className="relative overflow-hidden rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-neutral-100 dark:border-white/10 bg-neutral-50 aspect-[21/9] sm:aspect-[24/10]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentCategoryBannerIndex}
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.6, ease: "easeInOut" }}
                      className="absolute inset-0 w-full h-full cursor-pointer"
                      onClick={() => categoryBanners[currentCategoryBannerIndex].linkUrl && (window.location.href = categoryBanners[currentCategoryBannerIndex].linkUrl)}
                    >
                      <img
                        src={categoryBanners[currentCategoryBannerIndex].imageUrl || categoryBanners[currentCategoryBannerIndex].image}
                        alt={categoryBanners[currentCategoryBannerIndex].title || "Category Banner"}
                        className="w-full h-full object-cover block"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    </motion.div>
                  </AnimatePresence>

                  {/* Indicators/Dots */}
                  {categoryBanners.length > 1 && (
                    <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-30">
                      {categoryBanners.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentCategoryBannerIndex(idx);
                          }}
                          className={`transition-all duration-300 rounded-full ${currentCategoryBannerIndex === idx
                            ? "w-6 sm:w-8 h-1.5 sm:h-2 bg-white"
                            : "w-1.5 sm:w-2 h-1.5 sm:h-2 bg-white/50 hover:bg-white/80"
                            }`}
                          aria-label={`Go to category banner ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Fixed Main Category Sections matching User Request */}
          {!isLoading && apiData.allCategories && (
            <div className="space-y-8 mb-8">
              {[
                { id: 'grocery', title: 'Grocery & Kitchen' },
                { id: 'snacks', title: 'Snacks & Drinks' },
                { id: 'beauty', title: 'Beauty & Wellness' },
                { id: 'household', title: 'Household & Lifestyle' }
              ].map((header) => {
                // More flexible matching for root categories
                const rootCategory = apiData.allCategories.find(c => {
                  const s = c.slug?.toLowerCase() || "";
                  const n = c.name?.toLowerCase() || "";
                  const id = header.id.toLowerCase();

                  return s === id ||
                    s.includes(id) ||
                    n.includes(id) ||
                    (id === 'grocery' && (s.includes('kitchen') || n.includes('kitchen'))) ||
                    (id === 'snacks' && (s.includes('drinks') || n.includes('drinks'))) ||
                    (id === 'beauty' && (s.includes('wellness') || n.includes('wellness'))) ||
                    (id === 'household' && (s.includes('lifestyle') || n.includes('lifestyle')));
                });

                if (!rootCategory || !rootCategory.subCategories.length) return null;

                return (
                  <section key={header.id} className="w-full">
                    <div className="flex items-center justify-between mb-6 px-1">
                      <h2 className="text-xl sm:text-2xl md:text-[23px] font-black text-[#1F2937] tracking-tight">
                        {header.title}
                      </h2>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4 md:gap-5">
                      {rootCategory.subCategories.map((subCat) => (
                        <Link
                          key={subCat.id || subCat.slug}
                          to={`/food/user/in-mart/products/${subCat.slug || subCat.id}`}
                          className="group"
                        >
                          <motion.div
                            whileHover={{ y: -4 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="flex flex-col items-center gap-2"
                          >
                            <div className="w-full aspect-square bg-[#ECF3FF] rounded-[2rem] overflow-hidden p-2 flex items-center justify-center transition-all group-hover:shadow-xl group-hover:shadow-blue-900/10">
                              <img
                                src={subCat.image || "https://via.placeholder.com/200"}
                                alt={subCat.name}
                                className="w-[85%] h-[85%] object-contain transform transition-transform duration-700 group-hover:scale-110"
                              />
                            </div>
                            <span className="text-[10px] sm:text-[11px] md:text-[12px] font-bold text-[#1F2937] text-center leading-[1.2] pt-1 px-1 line-clamp-2">
                              {subCat.name}
                            </span>
                          </motion.div>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}


          {/* Trending Near You Section */}
          <ProductSection
            title="Trending Near You"
            products={apiData.collections?.find(c => c.slug === 'trending')?.products || []}
            onSeeAll={() => navigate('/in-mart/section/trending')}
            themeColor={activeCategoryData.themeColor}
          />

          {/* Hibermart Branding Section */}
          <section className="mt-12 mb-8 py-12 sm:py-16 md:py-20 flex flex-col items-center bg-gray-50/40 dark:bg-white/5 border-t border-b border-gray-100/50 dark:border-white/5 select-none">
            <h2 className="text-[56px] sm:text-[80px] md:text-[100px] lg:text-[120px] font-black tracking-tighter leading-none italic bg-clip-text text-transparent bg-gradient-to-r from-[#16A34A] via-[#15803D] to-[#166534]">
              hibermart
            </h2>
            <p className="text-sm sm:text-lg md:text-xl font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mt-4">
              Freshness at your doorstep
            </p>
          </section>
        </div>
      </AnimatedPage>

      <VoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
        onResult={(text) => {
          setIsInMartSearchOpen(true);
          setHeroSearch(text);
        }}
      />

      <InMartSearchOverlay
        isOpen={isInMartSearchOpen}
        onClose={() => setIsInMartSearchOpen(false)}
        apiData={apiData}
        allProducts={allProducts}
        searchCategories={searchCategories}
        themeColor={activeCategoryData.themeColor}
        initialSearch={heroSearch}
      />
    </>
  )
}
