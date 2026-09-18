import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Search, SlidersHorizontal, ChevronDown, X } from "lucide-react"
import AnimatedPage from "./AnimatedPage"
import { Button } from "@/components/ui/button"
import AddToCartButton from "./AddToCartButton"

const scrollbarStyles = `
  .custom-vertical-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-vertical-scrollbar::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
  }
  .custom-vertical-scrollbar::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 10px;
  }
  .custom-vertical-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #999;
  }
`;

export default function ProductCategoryView({
    title,
    sidebarCategories = [],
    products = [],
    activeCategory: initialCategory,
    onCategoryChange
}) {
    const navigate = useNavigate()
    const [activeCategory, setActiveCategory] = useState(initialCategory || (sidebarCategories[0]?.name))
    const [isSortOpen, setIsSortOpen] = useState(false)
    const [sortBy, setSortBy] = useState('relevance')

    const sortedProducts = useMemo(() => {
        let items = [...products];
        if (sortBy === 'lowToHigh') {
            return items.sort((a, b) => a.price - b.price);
        } else if (sortBy === 'highToLow') {
            return items.sort((a, b) => b.price - a.price);
        }
        return items;
    }, [products, sortBy]);

    const handleCategoryClick = (catName) => {
        setActiveCategory(catName)
        if (onCategoryChange) onCategoryChange(catName)
    }

    const sortOptions = [
        { id: 'relevance', label: 'Relevance (default)' },
        { id: 'lowToHigh', label: 'Price (low to high)' },
        { id: 'highToLow', label: 'Price (high to low)' }
    ];

    return (
        <AnimatedPage className="bg-white" style={{ minHeight: '100vh', paddingBottom: '80px' }}>
            <style>{scrollbarStyles}</style>

            {/* Top Header */}
            <header className="sticky top-0 z-50 flex items-center justify-between px-3 sm:px-4 h-14 bg-white border-b border-gray-100">
                <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                    <button onClick={() => navigate(-1)} className="p-1 -ml-1 flex-shrink-0">
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
                    </button>
                    <h1 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight truncate">{title}</h1>
                </div>
                <button className="p-1 flex-shrink-0">
                    <Search className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
                </button>
            </header>

            <div className="flex w-full min-h-[calc(100vh-56px)]">
                {/* Left Sidebar */}
                <aside className="w-[85px] sm:w-[110px] flex-shrink-0 border-r border-gray-100 bg-[#F9F9F9] sticky top-14 h-[calc(100vh-56px)] overflow-y-auto custom-vertical-scrollbar z-40 pb-20">
                    {sidebarCategories.map((cat) => {
                        const isActive = activeCategory === cat.name;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => handleCategoryClick(cat.name)}
                                className={`flex flex-col items-center py-3 sm:py-4 px-1 w-full transition-all relative group ${isActive ? 'bg-white' : 'hover:bg-gray-50'}`}
                            >
                                <div className={`w-[48px] h-[48px] sm:w-[64px] sm:h-[64px] rounded-[16px] sm:rounded-[20px] overflow-hidden mb-1.5 sm:mb-2 flex items-center justify-center transition-all ${isActive ? 'ring-[2.5px] ring-[#101828] scale-100 shadow-sm bg-white p-0.5' : 'bg-[#EBF4FF] opacity-80 group-hover:opacity-100'}`}>
                                    <div className={`w-full h-full rounded-[14px] sm:rounded-[18px] overflow-hidden flex items-center justify-center ${isActive ? 'bg-white' : 'bg-transparent'}`}>
                                        <img
                                            src={cat.icon}
                                            alt={cat.name}
                                            className="w-[85%] h-[85%] object-contain"
                                        />
                                    </div>
                                </div>
                                <span className={`text-[9px] sm:text-[11px] leading-tight font-bold text-center px-1 break-words max-w-[75px] sm:max-w-[95px] transition-colors ${isActive ? 'text-[#101828]' : 'text-slate-500 font-semibold'}`}>
                                    {cat.name}
                                </span>
                            </button>
                        );
                    })}
                </aside>

                {/* Main Content */}
                <main className="flex-1 bg-white min-w-0">
                    {/* Quick Filters */}
                    <div className="sticky top-14 z-40 bg-white/95 backdrop-blur-md py-3 px-3 sm:px-4 flex flex-col gap-3 border-b border-gray-100 shadow-sm/5">
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                            <Button
                                onClick={() => setIsSortOpen(true)}
                                variant="outline"
                                className="rounded-xl h-8 px-3 border-gray-200 text-[10px] sm:text-xs font-bold gap-1.5 flex-shrink-0 bg-white shadow-sm hover:bg-gray-50 transition-all active:scale-95"
                            >
                                Filters <SlidersHorizontal size={12} strokeWidth={3} />
                            </Button>
                        </div>
                    </div>

                    {/* Product Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 p-2 sm:p-4 gap-y-6 sm:gap-y-10 gap-x-2.5 sm:gap-x-6">
                        {sortedProducts.map((product) => (
                            <div key={product.id || product._id} className="flex flex-col group relative w-full bg-white rounded-[2.5rem] overflow-hidden shadow-xl shadow-neutral-200/20 border border-neutral-100 h-full p-2 sm:p-3 hover:border-black transition-all">
                                {/* Image Container */}
                                <div className="relative aspect-square w-full bg-[#F8F9FA] rounded-[2rem] flex items-center justify-center p-3 overflow-hidden">
                                    <img src={product.image || "https://via.placeholder.com/200"} alt={product.name} className="w-[85%] h-[85%] object-contain transition-transform duration-700 group-hover:scale-110" />

                                    {/* Sunburst Discount Badge matching Screenshot 2 */}
                                    {product.discount && (
                                        <div className="absolute top-2 left-2 z-20 w-8 h-8 flex items-center justify-center">
                                            <div className="absolute inset-0 bg-[#7B61FF] rotate-[22.5deg] rounded-lg shadow-sm" />
                                            <div className="absolute inset-0 bg-[#7B61FF] rotate-[67.5deg] rounded-lg shadow-sm" />
                                            <span className="relative z-30 text-[7px] font-black text-white leading-tight text-center px-1 uppercase whitespace-pre-line">
                                                {product.discount.split(' ').join('\n')}
                                            </span>
                                        </div>
                                    )}

                                    {/* Ad Tag & Veg Icon */}
                                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-white/95 backdrop-blur-md rounded-lg px-2 py-0.5 border border-neutral-100 shadow-sm">
                                        <span className="text-[7px] sm:text-[8px] font-black text-[#101828] uppercase tracking-tighter">AD</span>
                                        <div className="w-[10px] h-[10px] sm:w-3 sm:h-3 border border-emerald-500 flex items-center justify-center p-[0.5px] bg-white rounded-full">
                                            <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                                        </div>
                                    </div>
                                </div>

                                {/* Info Container */}
                                <div className="px-2 pt-3 pb-2 flex flex-col flex-1">
                                    <div className="flex-1 space-y-1">
                                        <div className="text-[8px] sm:text-[9px] font-black text-neutral-400 uppercase tracking-widest">{product.deliveryTime || '10 MINS'}</div>
                                        <h3 className="text-[13px] sm:text-[14px] font-bold text-[#101828] line-clamp-2 leading-[1.2] tracking-tight min-h-[34px]">
                                            {product.name}
                                        </h3>
                                        <p className="text-[10px] sm:text-[11px] font-bold text-neutral-400">
                                            {product.weight || '1 unit'}
                                        </p>
                                    </div>

                                    {/* Price and Add Button */}
                                    <div className="mt-4 pt-2 flex items-center justify-between gap-2 border-t border-neutral-50/10">
                                        <div className="flex flex-col">
                                            <span className="text-[15px] font-black text-[#101828] leading-none">₹{product.price}</span>
                                            {product.originalPrice && product.originalPrice !== product.price && (
                                                <span className="text-[11px] text-neutral-300 line-through font-bold mt-1">₹{product.originalPrice}</span>
                                            )}
                                        </div>
                                        <AddToCartButton
                                            item={{
                                                ...product,
                                                restaurant: "Hibermart",
                                                restaurantId: "hibermart-id"
                                            }}
                                            className="w-[66px] sm:w-[76px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            </div>

            {/* Sort Bottom Sheet */}
            <AnimatePresence>
                {isSortOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsSortOpen(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
                        />

                        {/* Bottom Sheet */}
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] z-[101] shadow-[0_-8px_30px_rgba(0,0,0,0.1)] pb-20"
                        >
                            {/* Close Button Container */}
                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex justify-center">
                                <button
                                    onClick={() => setIsSortOpen(false)}
                                    className="w-12 h-12 bg-[#1F2937] rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
                                >
                                    <X size={24} strokeWidth={2.5} />
                                </button>
                            </div>

                            <div className="p-6">
                                <h3 className="text-2xl font-black text-gray-900 mb-8 px-2 tracking-tight">Sort by</h3>

                                <div className="space-y-2">
                                    {sortOptions.map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => {
                                                setSortBy(option.id);
                                                setTimeout(() => setIsSortOpen(false), 200);
                                            }}
                                            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 transition-colors group"
                                        >
                                            <span className={`text-base font-bold transition-colors ${sortBy === option.id ? 'text-[#166534]' : 'text-gray-500'}`}>
                                                {option.label}
                                            </span>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${sortBy === option.id ? 'border-[#166534] bg-white' : 'border-gray-200'}`}>
                                                {sortBy === option.id && (
                                                    <div className="w-3 h-3 rounded-full bg-[#166534]" />
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </AnimatedPage>
    )
}
