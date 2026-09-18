import { useState, useMemo, useEffect } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ArrowLeft, ShoppingBag, Heart } from "lucide-react"
import api from "@/lib/api"
import inmartAPI from "@/lib/api/inmartAPI"
import AnimatedPage from "../components/AnimatedPage"
import AddToCartButton from "../components/AddToCartButton"

const ProductCard = ({ product, themeColor }) => (
    <div className="flex flex-col bg-white dark:bg-[#1a1a1a] rounded-2xl p-3 relative shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100/50 dark:border-white/5 group transition-all hover:shadow-xl h-full">
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
            <div className="absolute top-2 right-2 z-10 bg-[#FF5C5C] text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-md shadow-sm">
                NEW
            </div>
        )}

        {/* Product Image */}
        <div className="relative aspect-square w-full mb-3 bg-gray-50 dark:bg-white/5 rounded-xl flex items-center justify-center p-2 overflow-hidden">
            <img src={product.image} alt={product.name} className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-500" />
            <button className="absolute bottom-2 right-2 p-1.5 bg-white/90 dark:bg-black/50 backdrop-blur-sm rounded-full shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                <Heart size={14} className="text-[#FF725E] fill-current" />
            </button>
        </div>

        {/* Details */}
        <div className="flex-1 px-1 flex flex-col justify-between">
            <div className="space-y-1">
                <h3 className="text-[14px] sm:text-base font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug tracking-tight">
                    {product.name}
                </h3>
                <p className="text-[11px] sm:text-xs font-semibold text-gray-500">
                    {product.weight}
                </p>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="font-black text-gray-900 dark:text-white text-base sm:text-lg">
                        ₹{product.price}
                    </span>
                    {product.originalPrice && (
                        <span className="text-xs text-gray-400 line-through">
                            ₹{product.originalPrice}
                        </span>
                    )}
                </div>
                <AddToCartButton
                    item={{ ...product, restaurant: "Hibermart", restaurantId: "hibermart-id" }}
                    className="w-[60px] sm:w-[70px]"
                />
            </div>
        </div>
    </div>
);

const AnimatedGoldenLines = () => {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <svg className="w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FBDF93" stopOpacity="0" />
                        <stop offset="50%" stopColor="#FBDF93" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#FBDF93" stopOpacity="0" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Center radiating curved lines */}
                {[...Array(6)].map((_, i) => (
                    <motion.path
                        key={`line-right-${i}`}
                        d={`M 500 500 Q ${600 + i * 50} ${300 - i * 40} ${900} ${500 + i * 60}`}
                        stroke="url(#goldGradient)"
                        strokeWidth="1.5"
                        fill="none"
                        filter="url(#glow)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                            pathLength: [0, 1, 0],
                            opacity: [0, 0.5, 0],
                            pathOffset: [0, 1.5]
                        }}
                        transition={{
                            duration: 10 + i * 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.8
                        }}
                    />
                ))}

                {[...Array(6)].map((_, i) => (
                    <motion.path
                        key={`line-left-${i}`}
                        d={`M 500 500 Q ${400 - i * 50} ${700 + i * 40} ${100} ${500 - i * 60}`}
                        stroke="url(#goldGradient)"
                        strokeWidth="1.5"
                        fill="none"
                        filter="url(#glow)"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                            pathLength: [0, 1, 0],
                            opacity: [0, 0.5, 0],
                            pathOffset: [0, 1.5]
                        }}
                        transition={{
                            duration: 10 + i * 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.8
                        }}
                    />
                ))}

                {/* Vertical radiating lines */}
                {[...Array(4)].map((_, i) => (
                    <motion.path
                        key={`line-up-${i}`}
                        d={`M 500 500 Q ${500 + (i % 2 === 0 ? 100 : -100)} ${400} ${500 + (i % 2 === 0 ? 200 : -200)} 0`}
                        stroke="url(#goldGradient)"
                        strokeWidth="1"
                        fill="none"
                        filter="url(#glow)"
                        animate={{
                            pathLength: [0, 1, 0],
                            opacity: [0, 0.3, 0],
                            pathOffset: [0, 1.2]
                        }}
                        transition={{
                            duration: 12 + i * 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 1.5
                        }}
                    />
                ))}
            </svg>
        </div>
    );
};

export default function ProductSectionPage() {
    const { sectionId } = useParams()
    const navigate = useNavigate()
    const [products, setProducts] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [sectionTitle, setSectionTitle] = useState("")
    const [themeColor, setThemeColor] = useState("#8B5CF6")

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true)
                const response = await inmartAPI.getInMartHome()
                if (response.success) {
                    const collections = response.data.collections || []

                    let title = ""
                    let foundProducts = []
                    let color = "#8B5CF6"

                    switch (sectionId) {
                        case 'newly-launched':
                            title = "Newly Launched"
                            foundProducts = collections.find(c => c.slug === 'newly-launched')?.products || []
                            color = "#EC4899" // Pinkish
                            break
                        case 'best-sellers':
                            title = "Best Sellers"
                            foundProducts = collections.find(c => c.slug === 'best-sellers')?.products || []
                            color = "#8B5CF6" // Purple
                            break
                        case 'trending':
                            title = "Trending Near You"
                            foundProducts = collections.find(c => c.slug === 'trending')?.products || []
                            color = "#F59E0B" // Amber
                            break
                        case 'sale':
                            title = "Big Sale"
                            foundProducts = collections.find(c => c.slug === 'sale')?.products || []
                            color = "#EF4444" // Red
                            break
                        default:
                            title = "Products"
                            foundProducts = []
                    }

                    setSectionTitle(title)
                    setProducts(foundProducts)
                    setThemeColor(color)
                }
            } catch (error) {
                console.error("Failed to fetch products:", error)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [sectionId])

    return (
        <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] pb-20">
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&display=swap');
          
          .font-luxury {
            font-family: 'Playfair Display', serif;
          }

          .gold-text-gradient {
            background: linear-gradient(135deg, #FDE68A 0%, #F59E0B 50%, #D97706 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
          }
        `}
            </style>

            {/* Hero Section */}
            <section className="relative w-full h-[60vh] sm:h-[70vh] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#4a0404] to-[#2a0202]">
                {/* Animated Golden Lines Background */}
                <AnimatedGoldenLines />

                {/* Back Button */}
                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-6 left-6 z-20 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 hover:bg-white/20 transition-all"
                >
                    <ArrowLeft size={20} />
                </button>

                {/* Heading */}
                <div className="relative z-10 text-center px-4">
                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-luxury font-bold italic gold-text-gradient tracking-tight"
                    >
                        {sectionTitle}
                    </motion.h1>

                    <motion.div
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 1 }}
                        className="h-[2px] w-32 sm:w-64 bg-gradient-to-r from-transparent via-[#FDE68A] to-transparent mx-auto mt-6"
                    />
                </div>
            </section>

            {/* Products Grid */}
            <div className="max-w-7xl lg:max-w-[1400px] xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-8 relative z-20">
                <div className="p-2 sm:p-4">
                    {isLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="aspect-[3/4] bg-slate-100 dark:bg-white/5 animate-pulse rounded-2xl" />
                            ))}
                        </div>
                    ) : products.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                            {products.map((product, idx) => (
                                <motion.div
                                    key={product._id || idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <ProductCard product={product} themeColor={themeColor} />
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6">
                                <ShoppingBag className="w-10 h-10 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">No products found</h3>
                            <p className="text-gray-500 mt-2">We couldn't find any products in this section.</p>
                            <button
                                onClick={() => navigate('/in-mart')}
                                className="mt-8 px-8 py-3 bg-red-800 text-white rounded-full font-bold hover:bg-red-700 transition-all"
                            >
                                Go back to InMart
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </AnimatedPage>
    )
}
