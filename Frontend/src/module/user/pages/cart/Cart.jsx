import { useState, useEffect, useRef, useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Minus, ArrowLeft, ChevronRight, Clock, MapPin, Phone, FileText, Utensils, Tag, Percent, Share2, ChevronUp, ChevronDown, X, Check, Settings, CreditCard, Wallet, Building2, Sparkles, Navigation, Search, Image as ImageIcon, Briefcase, User as UserIcon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import confetti from "canvas-confetti"

// Fix for default marker icon in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

import AnimatedPage from "../../components/AnimatedPage"
import { Button } from "@/components/ui/button"
import { useCart } from "../../context/CartContext"
import { useProfile } from "../../context/ProfileContext"
import { useOrders } from "../../context/OrdersContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import { orderAPI, restaurantAPI, adminAPI, userAPI, API_ENDPOINTS } from "@/lib/api"
import { API_BASE_URL } from "@/lib/api/config"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"


// Removed hardcoded suggested items - now fetching approved addons from backend
// Coupons will be fetched from backend based on items in cart

/**
 * Format full address string from address object
 * @param {Object} address - Address object with street, additionalDetails, city, state, zipCode, or formattedAddress
 * @returns {String} Formatted address string
 */
const formatFullAddress = (address) => {
  if (!address) return ""

  // Priority 1: Use formattedAddress if available (for live location addresses)
  if (address.formattedAddress && address.formattedAddress !== "Select location") {
    return address.formattedAddress
  }

  // Priority 2: Build address from parts
  const addressParts = []
  if (address.street) addressParts.push(address.street)
  if (address.additionalDetails) addressParts.push(address.additionalDetails)
  if (address.city) addressParts.push(address.city)
  if (address.state) addressParts.push(address.state)
  if (address.zipCode) addressParts.push(address.zipCode)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }

  // Priority 3: Use address field if available
  if (address.address && address.address !== "Select location") {
    return address.address
  }

  return ""
}

export default function Cart() {
  const navigate = useNavigate()

  // Defensive check: Ensure CartProvider is available
  let cartContext;
  try {
    cartContext = useCart();
  } catch (error) {
    console.error('❌ CartProvider not found. Make sure Cart component is rendered within UserLayout.');
    // Return early with error message
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cart Error</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Cart functionality is not available. Please refresh the page.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  const { cart, updateQuantity, addToCart, getCartCount, clearCart, cleanCartForRestaurant } = cartContext;
  const { getDefaultAddress, getDefaultPaymentMethod, addresses, paymentMethods, userProfile } = useProfile()
  const { createOrder } = useOrders()
  const { location: currentLocation } = useUserLocation() // Get live location address
  const { zoneId } = useZone(currentLocation) // Get user's zone

  const [showCoupons, setShowCoupons] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponCode, setCouponCode] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("razorpay") // razorpay | cash | wallet
  const [walletBalance, setWalletBalance] = useState(0)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  // Tip state
  const [tipAmount, setTipAmount] = useState(0)
  const [selectedTip, setSelectedTip] = useState(null) // null | 20 | 30 | 50 | 'other'
  const [showTipSection, setShowTipSection] = useState(false)
  const [customTipInput, setCustomTipInput] = useState("")
  const [note, setNote] = useState("")
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [sendCutlery, setSendCutlery] = useState(true)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [showBillDetails, setShowBillDetails] = useState(false)
  const [showPlacingOrder, setShowPlacingOrder] = useState(false)
  const [orderProgress, setOrderProgress] = useState(0)
  const [showOrderSuccess, setShowOrderSuccess] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState(null)
  const [wasHibermartOrder, setWasHibermartOrder] = useState(false)

  // New Address / Checkout Flow State
  const [checkoutStage, setCheckoutStage] = useState('cart') // cart, address_selection, map_picker, address_details, confirm_details, payment
  const [isAddressConfirmed, setIsAddressConfirmed] = useState(false)
  const [selectedAddressForOrder, setSelectedAddressForOrder] = useState(null)
  const [tempMapCoords, setTempMapCoords] = useState(null)
  const [tempAddressInfo, setTempAddressInfo] = useState({
    area: '',
    city: '',
    formattedAddress: ''
  })
  const [receiverDetails, setReceiverDetails] = useState({
    useAccountDetails: true,
    name: userProfile?.name || '',
    phone: userProfile?.phone || '',
    houseNo: '',
    buildingName: '',
    landmark: '',
    saveAs: 'House', // House, Office, Other
    instructions: ''
  })

  // Payment UI State
  const [showPaymentOptions, setShowPaymentOptions] = useState(false)
  const [showCashConfirm, setShowCashConfirm] = useState(false)
  const [selectedUpiApp, setSelectedUpiApp] = useState(null) // null | 'google_pay' | 'paytm' | 'phonepe'


  // Restaurant and pricing state
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(false)
  const [pricing, setPricing] = useState(null)
  const [loadingPricing, setLoadingPricing] = useState(false)

  // Addons state
  const [addons, setAddons] = useState([])
  const [loadingAddons, setLoadingAddons] = useState(false)

  // Coupons state - fetched from backend
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)

  // Fee settings from database (used as fallback if pricing not available)
  const [feeSettings, setFeeSettings] = useState({
    deliveryFee: 25,
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
  })


  const cartCount = getCartCount()
  const isHibermartCart = cart[0]?.restaurantId === 'hibermart-id' || cart[0]?.restaurant === 'Hibermart'
  const savedAddress = getDefaultAddress()
  // Priority: Use live location if available, otherwise use saved address.
  //
  // Memoised deliberately. This used to be a bare object literal, so it got a
  // fresh identity on every render -- and it is a dependency of the pricing
  // effect below, which sets state. That closed a loop: effect -> setState ->
  // render -> new address object -> effect, firing /orders/calculate forever.
  // Keying on the primitive fields keeps the value stable until the location or
  // the saved address actually changes.
  const defaultAddress = useMemo(() => {
    const hasLive = currentLocation?.formattedAddress &&
      currentLocation.formattedAddress !== "Select location"
    if (!hasLive) return savedAddress
    return {
      ...savedAddress,
      formattedAddress: currentLocation.formattedAddress,
      address: currentLocation.address || currentLocation.formattedAddress,
      street: currentLocation.street || currentLocation.address,
      city: currentLocation.city,
      state: currentLocation.state,
      zipCode: currentLocation.postalCode,
      area: currentLocation.area,
      location: currentLocation.latitude && currentLocation.longitude ? {
        coordinates: [currentLocation.longitude, currentLocation.latitude]
      } : savedAddress?.location
    }
  }, [
    savedAddress,
    currentLocation?.formattedAddress,
    currentLocation?.address,
    currentLocation?.street,
    currentLocation?.city,
    currentLocation?.state,
    currentLocation?.postalCode,
    currentLocation?.area,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ])
  const defaultPayment = getDefaultPaymentMethod()

  // Get restaurant ID from cart or restaurant data
  // Priority: restaurantData > cart[0].restaurantId
  // DO NOT use cart[0].restaurant as slug fallback - it creates wrong slugs
  const restaurantId = cart.length > 0
    ? (restaurantData?._id || restaurantData?.restaurantId || cart[0]?.restaurantId || null)
    : null

  // Stable restaurant ID for addons fetch (memoized to prevent dependency array issues)
  // Prefer restaurantData IDs (more reliable) over slug from cart
  const restaurantIdForAddons = useMemo(() => {
    // Only use restaurantData if it's loaded, otherwise wait
    if (restaurantData) {
      return restaurantData._id || restaurantData.restaurantId || null
    }
    // If restaurantData is not loaded yet, return null to wait
    return null
  }, [restaurantData])



  // Lock body scroll and scroll to top when any full-screen modal opens
  useEffect(() => {
    if (showPlacingOrder || showOrderSuccess) {
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${window.scrollY}px`

      // Scroll window to top
      window.scrollTo({ top: 0, behavior: 'instant' })
    } else {
      // Restore body scroll
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
    }
  }, [showPlacingOrder, showOrderSuccess])

  // Fetch restaurant data when cart has items
  useEffect(() => {
    const fetchRestaurantData = async () => {
      if (cart.length === 0) {
        setRestaurantData(null)
        return
      }

      // If we already have restaurantData, don't fetch again
      if (restaurantData) {
        return
      }

      setLoadingRestaurant(true)

      // Strategy 1: Try using restaurantId from cart if available
      if (cart[0]?.restaurantId) {
        try {
          const cartRestaurantId = cart[0].restaurantId;
          const cartRestaurantName = cart[0].restaurant;

          console.log("🔄 Fetching restaurant data by restaurantId from cart:", cartRestaurantId)
          const response = await restaurantAPI.getRestaurantById(cartRestaurantId)
          const data = response?.data?.data?.restaurant || response?.data?.restaurant

          if (data) {
            // CRITICAL: Validate that fetched restaurant matches cart items
            const fetchedRestaurantId = data.restaurantId || data._id?.toString();
            const fetchedRestaurantName = data.name;

            // Check if restaurantId matches
            const restaurantIdMatches =
              fetchedRestaurantId === cartRestaurantId ||
              data._id?.toString() === cartRestaurantId ||
              data.restaurantId === cartRestaurantId;

            // Check if restaurant name matches (if available in cart)
            const restaurantNameMatches =
              !cartRestaurantName ||
              fetchedRestaurantName?.toLowerCase().trim() === cartRestaurantName.toLowerCase().trim();

            if (!restaurantIdMatches) {
              console.error('❌ CRITICAL: Fetched restaurant ID does not match cart restaurantId!', {
                cartRestaurantId: cartRestaurantId,
                fetchedRestaurantId: fetchedRestaurantId,
                fetched_id: data._id?.toString(),
                fetched_restaurantId: data.restaurantId,
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Don't set restaurantData if IDs don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            if (!restaurantNameMatches) {
              console.warn('⚠️ WARNING: Restaurant name mismatch:', {
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Still proceed but log warning
            }

            console.log("✅ Restaurant data loaded from cart restaurantId:", {
              _id: data._id,
              restaurantId: data.restaurantId,
              name: data.name,
              cartRestaurantId: cartRestaurantId,
              cartRestaurantName: cartRestaurantName
            })
            setRestaurantData(data)
            setLoadingRestaurant(false)
            return
          }
        } catch (error) {
          console.warn("⚠️ Failed to fetch by cart restaurantId, trying fallback...", error)
        }
      }

      // Strategy 2: If no restaurantId in cart, search by restaurant name
      if (cart[0]?.restaurant && !restaurantData) {
        try {
          console.log("🔍 Searching restaurant by name:", cart[0].restaurant)
          const searchResponse = await restaurantAPI.getRestaurants({ limit: 100 })
          const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []
          console.log("📋 Fetched", restaurants.length, "restaurants for name search")

          // Try exact match first
          let matchingRestaurant = restaurants.find(r =>
            r.name?.toLowerCase().trim() === cart[0].restaurant?.toLowerCase().trim()
          )

          // If no exact match, try partial match
          if (!matchingRestaurant) {
            console.log("🔍 No exact match, trying partial match...")
            matchingRestaurant = restaurants.find(r =>
              r.name?.toLowerCase().includes(cart[0].restaurant?.toLowerCase().trim()) ||
              cart[0].restaurant?.toLowerCase().trim().includes(r.name?.toLowerCase())
            )
          }

          if (matchingRestaurant) {
            // CRITICAL: Validate that the found restaurant matches cart items
            const cartRestaurantName = cart[0]?.restaurant?.toLowerCase().trim();
            const foundRestaurantName = matchingRestaurant.name?.toLowerCase().trim();

            if (cartRestaurantName && foundRestaurantName && cartRestaurantName !== foundRestaurantName) {
              console.error("❌ CRITICAL: Restaurant name mismatch!", {
                cartRestaurantName: cart[0]?.restaurant,
                foundRestaurantName: matchingRestaurant.name,
                cartRestaurantId: cart[0]?.restaurantId,
                foundRestaurantId: matchingRestaurant.restaurantId || matchingRestaurant._id
              });
              // Don't set restaurantData if names don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            console.log("✅ Found restaurant by name:", {
              name: matchingRestaurant.name,
              _id: matchingRestaurant._id,
              restaurantId: matchingRestaurant.restaurantId,
              slug: matchingRestaurant.slug,
              cartRestaurantName: cart[0]?.restaurant
            })
            setRestaurantData(matchingRestaurant)
            setLoadingRestaurant(false)
            return
          } else {
            console.warn("⚠️ Restaurant not found even by name search. Searched in", restaurants.length, "restaurants")
            if (restaurants.length > 0) {
              console.log("📋 Available restaurant names:", restaurants.map(r => r.name).slice(0, 10))
            }
          }
        } catch (searchError) {
          console.warn("⚠️ Error searching restaurants by name:", searchError)
        }
      }

      // If all strategies fail, set to null
      setRestaurantData(null)
      setLoadingRestaurant(false)
    }

    fetchRestaurantData()
  }, [cart.length, cart[0]?.restaurantId, cart[0]?.restaurant])

  // Fetch approved addons for the restaurant
  useEffect(() => {
    const fetchAddonsWithId = async (idToUse) => {

      console.log("🔍 Addons fetch - Using ID:", {
        restaurantData: restaurantData ? {
          _id: restaurantData._id,
          restaurantId: restaurantData.restaurantId,
          name: restaurantData.name
        } : 'Not loaded',
        cartRestaurantId: restaurantId,
        idToUse: idToUse
      })

      // Convert to string for validation
      const idString = String(idToUse)
      console.log("🔍 Restaurant ID string:", idString, "Type:", typeof idString, "Length:", idString.length)

      // Validate ID format (should be ObjectId or restaurantId format)
      const isValidIdFormat = /^[a-zA-Z0-9\-_]+$/.test(idString) && idString.length >= 3

      if (!isValidIdFormat) {
        console.warn("⚠️ Restaurant ID format invalid:", idString)
        setAddons([])
        return
      }

      try {
        setLoadingAddons(true)
        console.log("🚀 Fetching addons for restaurant ID:", idString)
        const response = await restaurantAPI.getAddonsByRestaurantId(idString)
        console.log("✅ Addons API response received:", response?.data)
        console.log("📦 Response structure:", {
          success: response?.data?.success,
          data: response?.data?.data,
          addons: response?.data?.data?.addons,
          directAddons: response?.data?.addons
        })

        const data = response?.data?.data?.addons || response?.data?.addons || []
        console.log("📊 Fetched addons count:", data.length)
        console.log("📋 Fetched addons data:", JSON.stringify(data, null, 2))

        if (data.length === 0) {
          console.warn("⚠️ No addons returned from API. Response:", response?.data)
        } else {
          console.log("✅ Successfully fetched", data.length, "addons:", data.map(a => a.name))
        }

        setAddons(data)
      } catch (error) {
        // Log error for debugging
        console.error("❌ Addons fetch error:", {
          code: error.code,
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
          data: error.response?.data
        })
        // Silently handle network errors and 404 errors
        // Network errors (ERR_NETWORK) happen when backend is not running - this is OK for development
        // 404 errors mean restaurant might not have addons or restaurant not found - also OK
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          console.error("Error fetching addons:", error)
        }
        // Continue with cart even if addons fetch fails
        setAddons([])
      } finally {
        setLoadingAddons(false)
      }
    }

    const fetchAddons = async () => {
      if (cart.length === 0) {
        setAddons([])
        return
      }

      // Wait for restaurantData to be loaded (including fallback search)
      if (loadingRestaurant) {
        console.log("⏳ Waiting for restaurantData to load (including fallback search)...")
        return
      }

      // Must have restaurantData to fetch addons
      if (!restaurantData) {
        console.warn("⚠️ No restaurantData available for addons fetch")
        setAddons([])
        return
      }

      // Use restaurantData ID (most reliable)
      const idToUse = restaurantData._id || restaurantData.restaurantId
      if (!idToUse) {
        console.warn("⚠️ No valid restaurant ID in restaurantData")
        setAddons([])
        return
      }

      console.log("✅ Using restaurantData ID for addons:", idToUse)
      fetchAddonsWithId(idToUse)
    }

    fetchAddons()
  }, [restaurantData, cart.length, loadingRestaurant])

  // Fetch coupons for items in cart
  useEffect(() => {
    const fetchCouponsForCartItems = async () => {
      if (cart.length === 0 || !restaurantId) {
        setAvailableCoupons([])
        return
      }

      console.log(`[CART-COUPONS] Fetching coupons for ${cart.length} items in cart`)
      setLoadingCoupons(true)

      const allCoupons = []
      const uniqueCouponCodes = new Set()

      // Fetch coupons for each item in cart
      for (const cartItem of cart) {
        if (!cartItem.id) {
          console.log(`[CART-COUPONS] Skipping item without id:`, cartItem)
          continue
        }

        try {
          console.log(`[CART-COUPONS] Fetching coupons for itemId: ${cartItem.id}, name: ${cartItem.name}`)
          const response = await restaurantAPI.getCouponsByItemIdPublic(restaurantId, cartItem.id)

          if (response?.data?.success && response?.data?.data?.coupons) {
            const coupons = response.data.data.coupons
            console.log(`[CART-COUPONS] Found ${coupons.length} coupons for item ${cartItem.id}`)

            // Add coupons, avoiding duplicates
            coupons.forEach(coupon => {
              if (!uniqueCouponCodes.has(coupon.couponCode)) {
                uniqueCouponCodes.add(coupon.couponCode)
                // Convert backend coupon format to frontend format
                allCoupons.push({
                  code: coupon.couponCode,
                  discount: coupon.originalPrice - coupon.discountedPrice,
                  discountPercentage: coupon.discountPercentage,
                  minOrder: coupon.minOrderValue || 0,
                  description: `Save ₹${coupon.originalPrice - coupon.discountedPrice} with '${coupon.couponCode}'`,
                  originalPrice: coupon.originalPrice,
                  discountedPrice: coupon.discountedPrice,
                  itemId: cartItem.id,
                  itemName: cartItem.name,
                })
              }
            })
          }
        } catch (error) {
          console.error(`[CART-COUPONS] Error fetching coupons for item ${cartItem.id}:`, error)
        }
      }

      console.log(`[CART-COUPONS] Total unique coupons found: ${allCoupons.length}`, allCoupons)
      setAvailableCoupons(allCoupons)
      setLoadingCoupons(false)
    }

    fetchCouponsForCartItems()
  }, [cart, restaurantId])

  // Calculate pricing from backend whenever cart, address, or coupon changes
  useEffect(() => {
    const calculatePricing = async () => {
      if (cart.length === 0 || !defaultAddress) {
        setPricing(null)
        return
      }

      try {
        setLoadingPricing(true)
        const items = cart.map(item => ({
          // A sized dish is its own cart line (id = dish__size); the order refers to the dish
          // and names the size, which the backend prices from its own menu.
          itemId: item.foodId || item.id,
          ...(item.variantId ? { variantId: item.variantId, variantName: item.variantName, variantPrice: item.variantPrice } : {}),
          name: item.name,
          price: item.price, // Price should already be in INR
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const response = await orderAPI.calculateOrder({
          items,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: defaultAddress,
          couponCode: appliedCoupon?.code || couponCode || null,
          deliveryFleet: 'standard'
        })

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)

          // Update applied coupon if backend returns one
          if (response.data.data.pricing.appliedCoupon && !appliedCoupon) {
            const coupon = availableCoupons.find(c => c.code === response.data.data.pricing.appliedCoupon.code)
            if (coupon) {
              setAppliedCoupon(coupon)
            }
          }
        }
      } catch (error) {
        // Network errors or 404 errors - silently handle, fallback to frontend calculation
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          console.error("Error calculating pricing:", error)
        }
        // Fallback to frontend calculation if backend fails
        setPricing(null)
      } finally {
        setLoadingPricing(false)
      }
    }

    calculatePricing()
  }, [cart, defaultAddress, appliedCoupon, couponCode, restaurantId])

  // Fetch wallet balance
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        setIsLoadingWallet(true)
        const response = await userAPI.getWallet()
        if (response?.data?.success && response?.data?.data?.wallet) {
          setWalletBalance(response.data.data.wallet.balance || 0)
        }
      } catch (error) {
        console.error("Error fetching wallet balance:", error)
        setWalletBalance(0)
      } finally {
        setIsLoadingWallet(false)
      }
    }
    fetchWalletBalance()
  }, [])

  // Fetch fee settings on mount
  useEffect(() => {
    const fetchFeeSettings = async () => {
      try {
        const response = await adminAPI.getPublicFeeSettings()
        if (response.data.success && response.data.data.feeSettings) {
          setFeeSettings({
            deliveryFee: response.data.data.feeSettings.deliveryFee || 25,
            freeDeliveryThreshold: response.data.data.feeSettings.freeDeliveryThreshold || 149,
            platformFee: response.data.data.feeSettings.platformFee || 5,
            gstRate: response.data.data.feeSettings.gstRate || 5,
          })
        }
      } catch (error) {
        console.error('Error fetching fee settings:', error)
        // Keep default values on error
      }
    }
    fetchFeeSettings()
  }, [])

  // Use backend pricing if available, otherwise fallback to database settings
  const subtotal = pricing?.subtotal || cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0)
  const deliveryFee = pricing?.deliveryFee ?? (subtotal >= feeSettings.freeDeliveryThreshold || appliedCoupon?.freeDelivery ? 0 : feeSettings.deliveryFee)
  const platformFee = pricing?.platformFee || feeSettings.platformFee
  const gstCharges = pricing?.tax || Math.round(subtotal * (feeSettings.gstRate / 100))
  const discount = pricing?.discount || (appliedCoupon ? Math.min(appliedCoupon.discount, subtotal * 0.5) : 0)
  const totalBeforeDiscount = subtotal + deliveryFee + platformFee + gstCharges
  const total = (pricing?.total || (totalBeforeDiscount - discount)) + tipAmount
  const savings = pricing?.savings || (discount + (subtotal > 500 ? 32 : 0))

  // Restaurant name from data or cart
  const restaurantName = restaurantData?.name || cart[0]?.restaurant || "Restaurant"

  // Handler to select address by label (Home, Office, Other)
  const handleSelectAddressByLabel = async (label) => {
    try {
      // Find address with matching label
      const address = addresses.find(addr => addr.label === label)

      if (!address) {
        toast.error(`No ${label} address found. Please add an address first.`)
        return
      }

      // Get coordinates from address location
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (!latitude || !longitude) {
        toast.error(`Invalid coordinates for ${label} address`)
        return
      }

      // Update location in backend
      await userAPI.updateLocation({
        latitude,
        longitude,
        address: `${address.street}, ${address.city}`,
        city: address.city,
        state: address.state,
        area: address.additionalDetails || "",
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      })

      // Update the location in localStorage
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))

      toast.success(`${label} address selected!`)

      // Select for order flow
      setSelectedAddressForOrder(address)
      setIsAddressConfirmed(true)
      setCheckoutStage('payment')
    } catch (error) {
      console.error(`Error selecting ${label} address:`, error)
      toast.error(`Failed to select ${label} address. Please try again.`)
    }
  }

  const handleApplyCoupon = async (coupon) => {
    if (subtotal >= coupon.minOrder) {
      setAppliedCoupon(coupon)
      setCouponCode(coupon.code)
      setShowCoupons(false)

      // Recalculate pricing with new coupon
      if (cart.length > 0 && defaultAddress) {
        try {
          const items = cart.map(item => ({
            // A sized dish is its own cart line (id = dish__size); the order refers to the dish
            // and names the size, which the backend prices from its own menu.
            itemId: item.foodId || item.id,
            ...(item.variantId ? { variantId: item.variantId, variantName: item.variantName, variantPrice: item.variantPrice } : {}),
            name: item.name,
            price: item.price,
            quantity: item.quantity || 1,
            image: item.image,
            description: item.description,
            isVeg: item.isVeg !== false
          }))

          const response = await orderAPI.calculateOrder({
            items,
            restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
            deliveryAddress: defaultAddress,
            couponCode: coupon.code,
            deliveryFleet: deliveryFleet || 'standard'
          })

          if (response?.data?.success && response?.data?.data?.pricing) {
            setPricing(response.data.data.pricing)
          }
        } catch (error) {
          console.error("Error recalculating pricing:", error)
        }
      }
    }
  }


  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null)
    setCouponCode("")

    // Recalculate pricing without coupon
    if (cart.length > 0 && defaultAddress) {
      try {
        const items = cart.map(item => ({
          // A sized dish is its own cart line (id = dish__size); the order refers to the dish
          // and names the size, which the backend prices from its own menu.
          itemId: item.foodId || item.id,
          ...(item.variantId ? { variantId: item.variantId, variantName: item.variantName, variantPrice: item.variantPrice } : {}),
          name: item.name,
          price: item.price,
          quantity: item.quantity || 1,
          image: item.image,
          description: item.description,
          isVeg: item.isVeg !== false
        }))

        const response = await orderAPI.calculateOrder({
          items,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          deliveryAddress: defaultAddress,
          couponCode: null,
          deliveryFleet: deliveryFleet || 'standard'
        })

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)
        }
      } catch (error) {
        console.error("Error recalculating pricing:", error)
      }
    }
  }


  const handlePlaceOrder = async () => {
    if (!defaultAddress) {
      alert("Please add a delivery address")
      return
    }

    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    setIsPlacingOrder(true)

    // Use API_BASE_URL from config (supports both dev and production)

    try {
      console.log("🛒 Starting order placement process...")
      console.log("📦 Cart items:", cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })))
      console.log("💰 Applied coupon:", appliedCoupon?.code || "None")
      console.log("📍 Delivery address:", defaultAddress?.label || defaultAddress?.city)

      // Ensure couponCode is included in pricing
      const orderPricing = pricing || {
        subtotal,
        deliveryFee,
        tax: gstCharges,
        platformFee,
        discount,
        total,
        couponCode: appliedCoupon?.code || null
      };

      // Add couponCode if not present but coupon is applied
      if (!orderPricing.couponCode && appliedCoupon?.code) {
        orderPricing.couponCode = appliedCoupon.code;
      }

      // Include all cart items (main items + addons)
      // Note: Addons are added as separate cart items when user clicks the + button
      const orderItems = cart.map(item => ({
        // A sized dish is its own cart line (id = dish__size); the order refers to the dish
        // and names the size, which the backend prices from its own menu.
        itemId: item.foodId || item.id,
        ...(item.variantId ? { variantId: item.variantId, variantName: item.variantName, variantPrice: item.variantPrice } : {}),
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        image: item.image || "",
        description: item.description || "",
        isVeg: item.isVeg !== false
      }))

      console.log("📋 Order items to send:", orderItems)
      console.log("💵 Order pricing:", orderPricing)

      // Check API base URL before making request (for debugging)
      const fullUrl = `${API_BASE_URL}${API_ENDPOINTS.ORDER.CREATE}`;
      console.log("🌐 Making request to:", fullUrl)
      console.log("🔑 Authentication token present:", !!localStorage.getItem('accessToken') || !!localStorage.getItem('user_accessToken'))

      // CRITICAL: Validate restaurant ID before placing order
      // Ensure we're using the correct restaurant from restaurantData (most reliable)
      const finalRestaurantId = isHibermartCart
        ? 'hibermart-id'
        : (restaurantData?.restaurantId || restaurantData?._id || null);
      const finalRestaurantName = isHibermartCart
        ? 'Hibermart'
        : (restaurantData?.name || null);

      if (!finalRestaurantId && !isHibermartCart) {
        console.error('❌ CRITICAL: Cannot place order - Restaurant ID is missing!');
        console.error('📋 Debug info:', {
          restaurantData: restaurantData ? {
            _id: restaurantData._id,
            restaurantId: restaurantData.restaurantId,
            name: restaurantData.name
          } : 'Not loaded',
          cartRestaurantId: restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });
        alert('Error: Restaurant information is missing. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      // CRITICAL: Validate that ALL cart items belong to the SAME restaurant
      const cartRestaurantIds = cart
        .map(item => item.restaurantId)
        .filter(Boolean)
        .map(id => String(id).trim()); // Normalize to string and trim

      const cartRestaurantNames = cart
        .map(item => item.restaurant)
        .filter(Boolean)
        .map(name => name.trim().toLowerCase()); // Normalize names

      // Get unique values (after normalization)
      const uniqueRestaurantIds = [...new Set(cartRestaurantIds)];
      const uniqueRestaurantNames = [...new Set(cartRestaurantNames)];

      // Check if cart has items from multiple restaurants
      // Note: If restaurant names match, allow even if IDs differ (same restaurant, different ID format)
      if (!isHibermartCart && uniqueRestaurantNames.length > 1) {
        // Different restaurant names = definitely different restaurants
        console.error('❌ CRITICAL ERROR: Cart contains items from multiple restaurants!', {
          restaurantIds: uniqueRestaurantIds,
          restaurantNames: uniqueRestaurantNames,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });

        // Automatically clean cart to keep items from the restaurant matching restaurantData
        if (finalRestaurantId && finalRestaurantName) {
          console.log('🧹 Auto-cleaning cart to keep items from:', finalRestaurantName);
          cleanCartForRestaurant(finalRestaurantId, finalRestaurantName);
          toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
        } else {
          // If restaurantData is not available, keep items from first restaurant in cart
          const firstRestaurantId = cart[0]?.restaurantId;
          const firstRestaurantName = cart[0]?.restaurant;
          if (firstRestaurantId && firstRestaurantName) {
            console.log('🧹 Auto-cleaning cart to keep items from first restaurant:', firstRestaurantName);
            cleanCartForRestaurant(firstRestaurantId, firstRestaurantName);
            toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
          } else {
            toast.error('Cart contains items from different restaurants. Please clear cart and try again.');
          }
        }

        setIsPlacingOrder(false);
        return;
      }

      // If restaurant names match but IDs differ, that's OK (same restaurant, different ID format)
      // But log a warning in development
      if (!isHibermartCart && uniqueRestaurantIds.length > 1 && uniqueRestaurantNames.length === 1) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Cart items have different restaurant IDs but same name. This is OK if IDs are in different formats.', {
            restaurantIds: uniqueRestaurantIds,
            restaurantName: uniqueRestaurantNames[0]
          });
        }
      }

      // Validate that cart items' restaurantId matches the restaurantData
      if (!isHibermartCart && cartRestaurantIds.length > 0) {
        const cartRestaurantId = cartRestaurantIds[0];

        // Check if cart restaurantId matches restaurantData
        const restaurantIdMatches =
          cartRestaurantId === finalRestaurantId ||
          cartRestaurantId === restaurantData?._id?.toString() ||
          cartRestaurantId === restaurantData?.restaurantId;

        if (!restaurantIdMatches) {
          console.error('❌ CRITICAL ERROR: Cart restaurantId does not match restaurantData!', {
            cartRestaurantId: cartRestaurantId,
            finalRestaurantId: finalRestaurantId,
            restaurantDataId: restaurantData?._id?.toString(),
            restaurantDataRestaurantId: restaurantData?.restaurantId,
            restaurantDataName: restaurantData?.name,
            cartRestaurantName: cartRestaurantNames[0]
          });
          alert(`Error: Cart items belong to "${cartRestaurantNames[0] || 'Unknown Restaurant'}" but restaurant data doesn't match. Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Validate restaurant name matches
      if (!isHibermartCart && cartRestaurantNames.length > 0 && finalRestaurantName) {
        const cartRestaurantName = cartRestaurantNames[0];
        if (cartRestaurantName.toLowerCase().trim() !== finalRestaurantName.toLowerCase().trim()) {
          console.error('❌ CRITICAL ERROR: Restaurant name mismatch!', {
            cartRestaurantName: cartRestaurantName,
            finalRestaurantName: finalRestaurantName
          });
          alert(`Error: Cart items belong to "${cartRestaurantName}" but restaurant data shows "${finalRestaurantName}". Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Log order details for debugging
      console.log('✅ Order validation passed - Placing order with restaurant:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        restaurantDataId: restaurantData?._id,
        restaurantDataRestaurantId: restaurantData?.restaurantId,
        cartRestaurantId: cartRestaurantIds[0],
        cartRestaurantName: cartRestaurantNames[0],
        cartItemCount: cart.length
      });

      // FINAL VALIDATION: Double-check restaurantId before sending to backend
      const cartRestaurantId = cart[0]?.restaurantId;
      if (!isHibermartCart && cartRestaurantId && cartRestaurantId !== finalRestaurantId &&
        cartRestaurantId !== restaurantData?._id?.toString() &&
        cartRestaurantId !== restaurantData?.restaurantId) {
        console.error('❌ CRITICAL: Final validation failed - restaurantId mismatch!', {
          cartRestaurantId: cartRestaurantId,
          finalRestaurantId: finalRestaurantId,
          restaurantDataId: restaurantData?._id?.toString(),
          restaurantDataRestaurantId: restaurantData?.restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          finalRestaurantName: finalRestaurantName
        });
        alert('Error: Restaurant information mismatch detected. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      const orderPayload = {
        items: orderItems,
        address: selectedAddressForOrder || defaultAddress,
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        pricing: orderPricing,
        deliveryFleet: 'standard',
        note: note || "",
        sendCutlery: sendCutlery !== false,
        paymentMethod: selectedPaymentMethod,
        isHibermartOrder: isHibermartCart,
        zoneId: zoneId // CRITICAL: Pass zoneId for strict zone validation
      };
      // Log final order details (including paymentMethod for COD debugging)
      console.log('📤 FINAL: Sending order to backend with:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        itemCount: orderItems.length,
        totalAmount: orderPricing.total,
        paymentMethod: orderPayload.paymentMethod
      });

      // Check wallet balance if wallet payment selected
      if (selectedPaymentMethod === "wallet" && walletBalance < total) {
        toast.error(`Insufficient wallet balance. Required: ₹${total.toFixed(0)}, Available: ₹${walletBalance.toFixed(0)}`)
        setIsPlacingOrder(false)
        return
      }

      // Create order in backend
      const orderResponse = await orderAPI.createOrder(orderPayload)

      console.log("✅ Order created successfully:", orderResponse.data)

      const { order, razorpay } = orderResponse.data.data

      // Cash flow: order placed without online payment
      if (selectedPaymentMethod === "cash") {
        toast.success("Order placed with Cash on Delivery")
        setPlacedOrderId(order?.orderId || order?.id || null)
        setWasHibermartOrder(isHibermartCart)
        setShowOrderSuccess(true)
        clearCart()
        setIsPlacingOrder(false)
        return
      }

      // Wallet flow: order placed with wallet payment (already processed in backend)
      if (selectedPaymentMethod === "wallet") {
        toast.success("Order placed with Wallet payment")
        setPlacedOrderId(order?.orderId || order?.id || null)
        setWasHibermartOrder(isHibermartCart)
        setShowOrderSuccess(true)
        clearCart()
        setIsPlacingOrder(false)
        // Refresh wallet balance
        try {
          const walletResponse = await userAPI.getWallet()
          if (walletResponse?.data?.success && walletResponse?.data?.data?.wallet) {
            setWalletBalance(walletResponse.data.data.wallet.balance || 0)
          }
        } catch (error) {
          console.error("Error refreshing wallet balance:", error)
        }
        return
      }

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        console.error("❌ Razorpay initialization failed:", { razorpay, order })
        throw new Error(razorpay ? "Razorpay payment gateway is not configured. Please contact support." : "Failed to initialize payment")
      }

      console.log("💳 Razorpay order created:", {
        orderId: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        keyPresent: !!razorpay.key
      })

      // Get user info for Razorpay prefill
      const userInfo = userProfile || {}
      const userPhone = userInfo.phone || defaultAddress?.phone || ""
      const userEmail = userInfo.email || ""
      const userName = userInfo.name || ""

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)

      console.log("👤 User info for payment:", {
        name: userName,
        email: userEmail,
        phone: formattedPhone
      })

      // Get company name for Razorpay
      const companyName = await getCompanyNameAsync()

      // Initialize Razorpay payment
      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount, // Already in paise from backend
        currency: razorpay.currency || 'INR',
        order_id: razorpay.orderId,
        name: companyName,
        description: `Order ${order.orderId} - ₹${(razorpay.amount / 100).toFixed(2)}`,
        upiApp: selectedUpiApp, // null = generic, 'google_pay' | 'paytm' | 'phonepe' = jump to that app
        prefill: {
          name: userName,
          email: userEmail,
          contact: formattedPhone
        },
        notes: {
          orderId: order.orderId,
          userId: userInfo.id || "",
          restaurantId: restaurantId || "unknown"
        },
        handler: async (response) => {

          try {
            console.log("✅ Payment successful, verifying...", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id
            })

            // Verify payment with backend
            const verifyResponse = await orderAPI.verifyPayment({
              orderId: order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            })

            console.log("✅ Payment verification response:", verifyResponse.data)

            if (verifyResponse.data.success) {
              // Payment successful
              console.log("🎉 Order placed successfully:", {
                orderId: order.orderId,
                paymentId: verifyResponse.data.data?.payment?.paymentId
              })
              setPlacedOrderId(order.orderId)
              setWasHibermartOrder(isHibermartCart)
              setShowOrderSuccess(true)
              clearCart()
              setIsPlacingOrder(false)
            } else {
              throw new Error(verifyResponse.data.message || "Payment verification failed")
            }
          } catch (error) {
            console.error("❌ Payment verification error:", error)
            const errorMessage = error?.response?.data?.message || error?.message || "Payment verification failed. Please contact support."
            alert(errorMessage)
            setIsPlacingOrder(false)
          }
        },
        onError: (error) => {
          console.error("❌ Razorpay payment error:", error)
          // Don't show alert for user cancellation
          if (error?.code !== 'PAYMENT_CANCELLED' && error?.message !== 'PAYMENT_CANCELLED') {
            const errorMessage = error?.description || error?.message || "Payment failed. Please try again."
            alert(errorMessage)
          }
          setIsPlacingOrder(false)
        },
        onClose: () => {
          console.log("⚠️ Payment modal closed by user")
          setIsPlacingOrder(false)
        }
      })
    } catch (error) {
      console.error("❌ Order creation error:", error)

      let errorMessage = "Failed to create order. Please try again."

      // Handle network errors
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        const backendUrl = API_BASE_URL.replace('/api', '');
        errorMessage = `Cannot connect to the server. Please make sure the backend is running at ${backendUrl}`

        console.error("🔴 Network Error Details:", {
          code: error.code,
          message: error.message,
          config: {
            url: error.config?.url,
            baseURL: error.config?.baseURL,
            fullUrl: error.config?.baseURL + error.config?.url,
            method: error.config?.method
          },
          backendUrl: backendUrl,
          apiBaseUrl: API_BASE_URL
        })

        // Try to test backend connectivity
        try {
          fetch(backendUrl + '/health', { method: 'GET', signal: AbortSignal.timeout(5000) })
            .then(response => {
              if (response.ok) {
                console.log("✅ Backend health check passed - server is running")
              } else {
                console.warn("⚠️ Backend health check returned:", response.status)
              }
            })
            .catch(fetchError => {
              console.error("❌ Backend health check failed:", fetchError.message)
              console.error("💡 Make sure backend server is running at:", backendUrl)
            })
        } catch (fetchTestError) {
          console.error("❌ Could not test backend connectivity:", fetchTestError.message)
        }
      }
      // Handle timeout errors
      else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. The server is taking too long to respond. Please try again."
      }
      // Handle payment gateway not configured (402)
      else if (error.response?.status === 402 || error.response?.data?.error === 'RAZORPAY_NOT_CONFIGURED') {
        errorMessage = "💳 Payment gateway not configured yet. To accept online payments, add your Razorpay API keys from the Admin Panel → Environment Variables."
      }
      // Handle other axios errors
      else if (error.response) {
        // Server responded with error status
        const serverMsg = error.response.data?.message || `Server error: ${error.response.status}`;
        const serverDetail = error.response.data?.error || '';
        const serverFields = Array.isArray(error.response.data?.details) ? error.response.data.details.join(', ') : '';
        errorMessage = serverFields
          ? `${serverMsg}: ${serverFields}`
          : serverDetail
            ? `${serverMsg} — ${serverDetail}`
            : serverMsg;
        // Always log full details in console
        console.error('🔴 Server error details:', error.response.data);
      }
      // Handle other errors
      else if (error.message) {
        errorMessage = error.message
      }

      toast.error(errorMessage, { duration: 6000 })
      setIsPlacingOrder(false)
    }

  }

  const handleGoToOrders = () => {
    setShowOrderSuccess(false)
    navigate(`/food/user/orders/${placedOrderId}?confirmed=true`)
  }

  // Empty cart state - but don't show if order success or placing order modal is active
  if (cart.length === 0 && !showOrderSuccess && !showPlacingOrder) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="bg-white dark:bg-[#1a1a1a] border-b dark:border-gray-800 sticky top-0 z-10">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link onClick={() => navigate(-1)}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <span className="font-semibold text-gray-800 dark:text-white">Cart</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Utensils className="h-10 w-10 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Your cart is empty</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">Add items from a restaurant to start a new order</p>
          <Link>
            <Button className="bg-primary-orange hover:opacity-90 text-white">Browse Restaurants</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Header - Sticky at top */}
      <div className="bg-white dark:bg-[#1a1a1a] border-b dark:border-gray-800 sticky top-0 z-20 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Link onClick={() => navigate(-1)}>
                <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0">
                  <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </Link>
              <div className="min-w-0">
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{restaurantName}</p>
                <p className="text-sm md:text-base font-medium text-gray-800 dark:text-white truncate">
                  {restaurantData?.estimatedDeliveryTime || "10-15 mins"} to <span className="font-semibold">Location</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs md:text-sm">{defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || defaultAddress?.city || "Select address") : "Select address"}</span>
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0">
              <Share2 className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-52 md:pb-36">
        {/* Savings Banner */}
        {savings > 0 && (
          <div className="bg-blue-100 dark:bg-blue-900/20 px-4 md:px-6 py-2 md:py-3 flex-shrink-0">
            <div className="max-w-7xl mx-auto">
              <p className="text-sm md:text-base font-medium text-blue-800 dark:text-blue-200">
                🎉 You saved ₹{savings} on this order
              </p>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-6">
            {/* Left Column - Cart Items and Details */}
            <div className="lg:col-span-2 space-y-2 md:space-y-4">
              {/* Cart Items */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <div className="space-y-3 md:space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 md:gap-4">
                      {/* Veg/Non-veg indicator */}
                      <div className={`w-4 h-4 md:w-5 md:h-5 border-2 ${item.isVeg !== false ? 'border-green-600' : 'border-red-600'} flex items-center justify-center mt-1 flex-shrink-0`}>
                        <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${item.isVeg !== false ? 'bg-green-600' : 'bg-red-600'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200 leading-tight">{item.name}</p>
                        <button className="text-xs md:text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-0.5 mt-0.5">
                          Edit <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3 md:gap-4">
                        {/* Quantity controls */}
                        <div className="flex items-center border border-red-600 dark:border-red-500 rounded">
                          <button
                            className="px-2 md:px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3 md:h-4 md:w-4" />
                          </button>
                          <span className="px-2 md:px-3 text-sm md:text-base font-semibold text-red-600 dark:text-red-400 min-w-[20px] md:min-w-[24px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            className="px-2 md:px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3 md:h-4 md:w-4" />
                          </button>
                        </div>

                        <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200 min-w-[50px] md:min-w-[70px] text-right">
                          ₹{((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add more items */}
                <button
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-2 mt-4 md:mt-6 text-red-600 dark:text-red-400"
                >
                  <Plus className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="text-sm md:text-base font-medium">Add more items</span>
                </button>
              </div>


              {/* Note & Cutlery */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl flex flex-col sm:flex-row gap-2 md:gap-3">
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="flex-1 flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border border-gray-200 dark:border-gray-700 rounded-lg md:rounded-xl text-sm md:text-base text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <FileText className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="truncate">{note || "Add a note for the restaurant"}</span>
                </button>
                <button
                  onClick={() => setSendCutlery(!sendCutlery)}
                  className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 border rounded-lg md:rounded-xl text-sm md:text-base ${sendCutlery ? 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300' : 'border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}
                >
                  <Utensils className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="whitespace-nowrap">{sendCutlery ? "Don't send cutlery" : "No cutlery"}</span>
                </button>
              </div>

              {/* Note Input */}
              {showNoteInput && (
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add cooking instructions, allergies, etc."
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg md:rounded-xl p-3 md:p-4 text-sm md:text-base resize-none h-20 md:h-24 focus:outline-none focus:border-red-600 dark:focus:border-red-500 bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}

              {/* Complete your meal section - Approved Addons */}
              {addons.length > 0 && (
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                  <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                    <div className="w-6 h-6 md:w-8 md:h-8 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                      <span className="text-xs md:text-base">🍽️</span>
                    </div>
                    <span className="text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200">Complete your meal with</span>
                  </div>
                  {loadingAddons ? (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-28 md:w-36 animate-pulse">
                          <div className="w-full h-28 md:h-36 bg-gray-200 dark:bg-gray-700 rounded-lg md:rounded-xl" />
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mt-1 w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {addons.map((addon) => (
                        <div key={addon.id} className="flex-shrink-0 w-28 md:w-36">
                          <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg md:rounded-xl overflow-hidden">
                            <img
                              src={addon.image || (addon.images && addon.images[0]) || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"}
                              alt={addon.name}
                              className="w-full h-28 md:h-36 object-cover rounded-lg md:rounded-xl"
                              onError={(e) => {
                                e.target.onerror = null
                                e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"
                              }}
                            />
                            <div className="absolute top-1 md:top-2 left-1 md:left-2">
                              <div className="w-3.5 h-3.5 md:w-4 md:h-4 bg-white border border-green-600 flex items-center justify-center rounded">
                                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-600" />
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                // Use restaurant info from existing cart items to ensure format consistency
                                const cartRestaurantId = cart[0]?.restaurantId || restaurantId;
                                const cartRestaurantName = cart[0]?.restaurant || restaurantName;

                                if (!cartRestaurantId || !cartRestaurantName) {
                                  console.error('❌ Cannot add addon: Missing restaurant information', {
                                    cartRestaurantId,
                                    cartRestaurantName,
                                    restaurantId,
                                    restaurantName,
                                    cartItem: cart[0]
                                  });
                                  toast.error('Restaurant information is missing. Please refresh the page.');
                                  return;
                                }

                                addToCart({
                                  id: addon.id,
                                  name: addon.name,
                                  price: addon.price,
                                  image: addon.image || (addon.images && addon.images[0]) || "",
                                  description: addon.description || "",
                                  isVeg: true,
                                  restaurant: cartRestaurantName,
                                  restaurantId: cartRestaurantId
                                });
                              }}
                              className="absolute bottom-1 md:bottom-2 right-1 md:right-2 w-6 h-6 md:w-7 md:h-7 bg-white border border-red-600 rounded flex items-center justify-center shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4 text-red-600" />
                            </button>
                          </div>
                          <p className="text-xs md:text-sm font-medium text-gray-800 dark:text-gray-200 mt-1.5 md:mt-2 line-clamp-2 leading-tight">{addon.name}</p>
                          {addon.description && (
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{addon.description}</p>
                          )}
                          <p className="text-xs md:text-sm text-gray-800 dark:text-gray-200 font-semibold mt-0.5">₹{addon.price}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Coupon Section */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg md:rounded-xl p-3 md:p-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Tag className="h-4 w-4 md:h-5 md:w-5 text-red-600 dark:text-red-400" />
                      <div>
                        <p className="text-sm md:text-base font-medium text-red-700 dark:text-red-300">'{appliedCoupon.code}' applied</p>
                        <p className="text-xs md:text-sm text-red-600 dark:text-red-400">You saved ₹{discount}</p>
                      </div>
                    </div>
                    <button onClick={handleRemoveCoupon} className="text-gray-500 dark:text-gray-400 text-xs md:text-sm font-medium">Remove</button>
                  </div>
                ) : loadingCoupons ? (
                  <div className="flex items-center gap-2 md:gap-3">
                    <Percent className="h-4 w-4 md:h-5 md:w-5 text-gray-600 dark:text-gray-400" />
                    <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">Loading coupons...</p>
                  </div>
                ) : availableCoupons.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-3">
                        <Percent className="h-4 w-4 md:h-5 md:w-5 text-gray-600 dark:text-gray-400" />
                        <div>
                          <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200">
                            Save ₹{availableCoupons[0].discount} with '{availableCoupons[0].code}'
                          </p>
                          {availableCoupons.length > 1 && (
                            <button onClick={() => setShowCoupons(!showCoupons)} className="text-xs md:text-sm text-blue-600 dark:text-blue-400 font-medium">
                              View all coupons →
                            </button>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 md:h-8 text-xs md:text-sm border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => handleApplyCoupon(availableCoupons[0])}
                        disabled={subtotal < availableCoupons[0].minOrder}
                      >
                        {subtotal < availableCoupons[0].minOrder ? `Min ₹${availableCoupons[0].minOrder}` : 'APPLY'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 md:gap-3">
                    <Percent className="h-4 w-4 md:h-5 md:w-5 text-gray-600 dark:text-gray-400" />
                    <p className="text-sm md:text-base text-gray-500 dark:text-gray-400">No coupons available</p>
                  </div>
                )}

                {/* Coupons List */}
                {showCoupons && !appliedCoupon && availableCoupons.length > 0 && (
                  <div className="mt-3 md:mt-4 space-y-2 md:space-y-3 border-t dark:border-gray-700 pt-3 md:pt-4">
                    {availableCoupons.map((coupon) => (
                      <div key={coupon.code} className="flex items-center justify-between py-2 md:py-3 border-b border-dashed dark:border-gray-700 last:border-0">
                        <div>
                          <p className="text-sm md:text-base font-medium text-gray-800 dark:text-gray-200">{coupon.code}</p>
                          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">{coupon.description}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 md:h-7 text-xs md:text-sm border-red-600 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => handleApplyCoupon(coupon)}
                          disabled={subtotal < coupon.minOrder}
                        >
                          {subtotal < coupon.minOrder ? `Min ₹${coupon.minOrder}` : 'APPLY'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delivery Time */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <div className="flex items-center gap-3 md:gap-4">
                  <Clock className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">Delivery in <span className="font-semibold">{restaurantData?.estimatedDeliveryTime || "10-15 mins"}</span></p>
                  </div>
                </div>
              </div>

              {/* Tip for Delivery Partner */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <button
                  onClick={() => setShowTipSection(!showTipSection)}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-lg">🙏</span>
                    <div>
                      <span className="text-sm md:text-base text-gray-800 dark:text-gray-200 font-medium">Tip your delivery partner</span>
                      {tipAmount > 0 && (
                        <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">₹{tipAmount} added</span>
                      )}
                    </div>
                  </div>
                  {showTipSection
                    ? <ChevronUp className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />}
                </button>

                <AnimatePresence>
                  {showTipSection && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-3">
                        Your kindness goes a long way! 100% of the tip goes to your delivery partner.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[20, 30, 50].map((amount) => (
                          <button
                            key={amount}
                            onClick={() => {
                              if (selectedTip === amount) {
                                setSelectedTip(null)
                                setTipAmount(0)
                              } else {
                                setSelectedTip(amount)
                                setTipAmount(amount)
                                setCustomTipInput("")
                              }
                            }}
                            className={`relative px-4 py-2 rounded-full border-2 text-sm font-semibold transition-all ${selectedTip === amount
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                              : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                              }`}
                          >
                            ₹{amount}
                            {amount === 30 && (
                              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap font-bold">
                                Most Tipped
                              </span>
                            )}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            if (selectedTip === 'other') {
                              setSelectedTip(null)
                              setTipAmount(0)
                              setCustomTipInput("")
                            } else {
                              setSelectedTip('other')
                              setTipAmount(0)
                              setCustomTipInput("")
                            }
                          }}
                          className={`flex items-center gap-1 px-4 py-2 rounded-full border-2 text-sm font-semibold transition-all ${selectedTip === 'other'
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                            }`}
                        >
                          Other
                          {selectedTip === 'other' && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedTip(null)
                                setTipAmount(0)
                                setCustomTipInput("")
                              }}
                              className="ml-1 text-orange-500 hover:text-orange-700"
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      </div>

                      {selectedTip === 'other' && (
                        <div className="mt-3 flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">₹</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="Enter Tip Amount"
                            value={customTipInput}
                            onChange={(e) => {
                              const val = e.target.value
                              setCustomTipInput(val)
                              const num = parseFloat(val)
                              setTipAmount(!isNaN(num) && num > 0 ? num : 0)
                            }}
                            className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400"
                          />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Delivery Address */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <Link className="flex items-center justify-between">
                  <div className="flex items-center gap-3 md:gap-4">
                    <MapPin className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">
                        Delivery at <span className="font-semibold">Location</span>
                      </p>
                      <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Add delivery address") : "Add delivery address"}
                      </p>
                      {/* Address Selection Buttons */}
                      <div className="flex gap-2 mt-2">
                        {["Home", "Office", "Other"].map((label) => {
                          const addressExists = addresses.some(addr => addr.label === label)
                          return (
                            <button
                              key={label}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSelectAddressByLabel(label)
                              }}
                              disabled={!addressExists}
                              className={`text-xs md:text-sm px-2 md:px-3 py-1 md:py-1.5 rounded-md border transition-colors ${addressExists
                                ? 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 bg-white dark:bg-[#1a1a1a]'
                                : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                                }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                </Link>
              </div>

              {/* Contact */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <Link to="/food/user/profile" className="flex items-center justify-between">
                  <div className="flex items-center gap-3 md:gap-4">
                    <Phone className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <p className="text-sm md:text-base text-gray-800 dark:text-gray-200">
                      {userProfile?.name || "Your Name"}, <span className="font-medium">{userProfile?.phone || "+91-XXXXXXXXXX"}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                </Link>
              </div>

              {/* Bill Details */}
              <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl">
                <button
                  onClick={() => setShowBillDetails(!showBillDetails)}
                  className="flex items-center justify-between w-full"
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <FileText className="h-4 w-4 md:h-5 md:w-5 text-gray-500 dark:text-gray-400" />
                    <div className="text-left">
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        <span className="text-sm md:text-base text-gray-800 dark:text-gray-200">Total Bill</span>
                        <span className="text-sm md:text-base text-gray-400 dark:text-gray-500 line-through">₹{totalBeforeDiscount.toFixed(0)}</span>
                        <span className="text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200">₹{total.toFixed(0)}</span>
                        {savings > 0 && (
                          <span className="text-xs md:text-sm bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1.5 md:px-2 py-0.5 rounded font-medium">You saved ₹{savings}</span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Incl. taxes and charges</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-gray-400" />
                </button>

                {showBillDetails && (
                  <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-dashed dark:border-gray-700 space-y-2 md:space-y-3">
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Item Total</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{subtotal.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
                      <span className={deliveryFee === 0 ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-200"}>
                        {deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Platform Fee</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{platformFee}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">GST and Restaurant Charges</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{gstCharges}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm md:text-base text-red-600 dark:text-red-400">
                        <span>Coupon Discount</span>
                        <span>-₹{discount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm md:text-base font-semibold pt-2 md:pt-3 border-t dark:border-gray-700">
                      <span>To Pay</span>
                      <span>₹{total.toFixed(0)}</span>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Right Column - Order Summary (Desktop) */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-24 space-y-4 md:space-y-6">
                {/* Bill Summary Card */}
                <div className="bg-white dark:bg-[#1a1a1a] px-4 md:px-6 py-4 md:py-5 rounded-lg md:rounded-xl border border-gray-200 dark:border-gray-700">
                  <h3 className="text-base md:text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3 md:mb-4">Order Summary</h3>
                  <div className="space-y-2 md:space-y-3">
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Item Total</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{subtotal.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Delivery Fee</span>
                      <span className={deliveryFee === 0 ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-200"}>
                        {deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">Platform Fee</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{platformFee}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600 dark:text-gray-400">GST</span>
                      <span className="text-gray-800 dark:text-gray-200">₹{gstCharges}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm md:text-base text-red-600 dark:text-red-400">
                        <span>Discount</span>
                        <span>-₹{discount}</span>
                      </div>
                    )}
                    {tipAmount > 0 && (
                      <div className="flex justify-between text-sm md:text-base text-green-600 dark:text-green-500">
                        <span>🙏 Delivery Partner Tip</span>
                        <span>+₹{tipAmount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base md:text-lg font-bold pt-3 md:pt-4 border-t dark:border-gray-700">
                      <span>Total</span>
                      <span className="text-green-600 dark:text-green-400">₹{total.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Multi-Step Address Flow Components --- */}

      {/* 1. Choose a delivery address Bottom Sheet */}
      <AnimatePresence>
        {checkoutStage === 'address_selection' && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCheckoutStage('cart')}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-[2.5rem] p-6 pb-12 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Choose a delivery address</h2>
                <button onClick={() => setCheckoutStage('cart')} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              <button
                onClick={() => {
                  if (currentLocation?.latitude) {
                    setTempMapCoords({ lat: currentLocation.latitude, lng: currentLocation.longitude })
                  } else {
                    setTempMapCoords({ lat: 17.3850, lng: 78.4867 }) // Hyderabad default
                  }
                  setCheckoutStage('map_picker')
                }}
                className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-orange-500 rounded-2xl mb-6 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors group"
              >
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-xl flex items-center justify-center">
                  <Plus className="h-6 w-6 text-orange-500" />
                </div>
                <span className="text-lg font-bold text-orange-500">Add new Address</span>
              </button>

              <div className="space-y-4">
                {addresses.map((addr) => (
                  <button
                    key={addr._id}
                    onClick={() => {
                      setSelectedAddressForOrder(addr)
                      setIsAddressConfirmed(true)
                      setCheckoutStage('payment')
                    }}
                    className="w-full flex items-start gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      {addr.label === 'Home' ? <MapPin className="h-6 w-6 text-gray-500" /> : <Navigation className="h-6 w-6 text-gray-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 dark:text-white capitalize">{addr.label || 'Other'}</p>
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">{formatFullAddress(addr)}</p>
                    </div>
                  </button>
                ))}
                {addresses.length === 0 && (
                  <div className="py-10 text-center">
                    <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No saved addresses found</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Map Picker Step */}
      <AnimatePresence>
        {checkoutStage === 'map_picker' && (
          <div className="fixed inset-0 z-[60] bg-white flex flex-col">
            <div className="absolute top-4 left-4 z-[1001] flex items-center gap-2">
              <button onClick={() => setCheckoutStage('address_selection')} className="p-3 bg-white shadow-lg rounded-full">
                <ArrowLeft className="h-6 w-6 text-gray-800" />
              </button>
              <div className="bg-white px-4 py-2 rounded-full shadow-lg border border-gray-100 flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400" />
                <input placeholder="Search an area or address" className="outline-none text-sm w-48 md:w-64" />
              </div>
            </div>

            <div className="flex-1 relative">
              <MapContainer
                center={tempMapCoords ? [tempMapCoords.lat, tempMapCoords.lng] : [17.3850, 78.4867]}
                zoom={16}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapEventsHandler setCoords={setTempMapCoords} setAddressInfo={setTempAddressInfo} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
                  <div className="relative -top-8 flex flex-col items-center">
                    <div className="bg-orange-500 w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-xl">
                      <MapPin className="h-6 w-6 text-white" />
                    </div>
                    <div className="w-1 h-8 bg-orange-500" />
                  </div>
                </div>
              </MapContainer>

              <button
                onClick={() => {
                  if (currentLocation?.latitude) {
                    setTempMapCoords({ lat: currentLocation.latitude, lng: currentLocation.longitude })
                  }
                }}
                className="absolute bottom-52 right-4 z-[1001] p-3 bg-white shadow-lg rounded-full flex items-center gap-2 border border-orange-100"
              >
                <Navigation className="h-5 w-5 text-orange-500 fill-orange-500" />
                <span className="text-sm font-bold text-gray-800">Current location</span>
              </button>

              <div className="absolute bottom-0 left-0 right-0 z-[1001] p-4">
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="bg-white rounded-3xl p-6 shadow-2xl border border-gray-100"
                >
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Place the pin at exact delivery location</p>
                  <p className="text-sm text-gray-500 mb-4 font-medium italic">Order will be delivered here</p>

                  <div className="flex items-start gap-4 mb-8">
                    <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-6 w-6 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-black text-xl text-gray-900 leading-tight mb-1">{tempAddressInfo.area || 'Locating...'}</p>
                      <p className="text-sm text-gray-500">{tempAddressInfo.formattedAddress || 'Fetching address details...'}</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => setCheckoutStage('address_details')}
                    disabled={!tempAddressInfo.formattedAddress}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white h-14 rounded-2xl text-lg font-black shadow-xl shadow-orange-200 transition-all hover:scale-[1.02]"
                  >
                    Confirm & proceed
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. Address Details Form Step */}
      <AnimatePresence>
        {checkoutStage === 'address_details' && (
          <div className="fixed inset-0 z-[60] bg-white dark:bg-[#0a0a0a] flex flex-col overflow-y-auto">
            <div className="p-4 flex items-center gap-4 sticky top-0 bg-white dark:bg-[#0a0a0a] border-b dark:border-gray-800 z-10">
              <button onClick={() => setCheckoutStage('map_picker')} className="p-2">
                <ArrowLeft className="h-6 w-6 text-gray-800 dark:text-gray-200" />
              </button>
              <div className="min-w-0">
                <p className="font-black text-lg text-gray-900 dark:text-white truncate">{tempAddressInfo.area || 'Pinned Location'}</p>
                <p className="text-xs text-gray-500 truncate">{tempAddressInfo.formattedAddress}</p>
              </div>
            </div>

            <div className="p-6 space-y-8 max-w-xl mx-auto w-full">
              {/* Receiver Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Receiver Details</h3>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="useAcc"
                    checked={receiverDetails.useAccountDetails}
                    onChange={(e) => setReceiverDetails({ ...receiverDetails, useAccountDetails: e.target.checked })}
                    className="w-5 h-5 accent-orange-500"
                  />
                  <label htmlFor="useAcc" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    Use my account details <span className="text-gray-400 font-medium ml-1">{userProfile?.name}, {userProfile?.phone}</span>
                  </label>
                </div>
                {!receiverDetails.useAccountDetails && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400">Name</label>
                      <input
                        value={receiverDetails.name}
                        onChange={e => setReceiverDetails({ ...receiverDetails, name: e.target.value })}
                        className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:border-orange-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400">Phone</label>
                      <input
                        value={receiverDetails.phone}
                        onChange={e => setReceiverDetails({ ...receiverDetails, phone: e.target.value })}
                        className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Location Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Location Details</h3>
                <div className="flex gap-2">
                  {['House', 'Office', 'Other'].map(type => (
                    <button
                      key={type}
                      onClick={() => setReceiverDetails({ ...receiverDetails, saveAs: type })}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold transition-all ${receiverDetails.saveAs === type ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}
                    >
                      {type === 'House' && <MapPin className="w-4 h-4" />}
                      {type === 'Office' && <Briefcase className="w-4 h-4" />}
                      {type === 'Other' && <Navigation className="w-4 h-4" />}
                      {type}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <input
                    placeholder="House / Flat / Floor *"
                    value={receiverDetails.houseNo}
                    onChange={e => setReceiverDetails({ ...receiverDetails, houseNo: e.target.value })}
                    className="w-full p-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:border-orange-500 shadow-sm"
                  />
                  <input
                    placeholder="Building / Street (Recommended)"
                    value={receiverDetails.buildingName}
                    onChange={e => setReceiverDetails({ ...receiverDetails, buildingName: e.target.value })}
                    className="w-full p-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:border-orange-500 shadow-sm"
                  />

                  <div className="p-4 border-2 border-gray-100 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-800/50 flex gap-4">
                    <div className="flex-1">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Area/Locality</p>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{tempAddressInfo.formattedAddress}</p>
                    </div>
                    <button onClick={() => setCheckoutStage('map_picker')} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 bg-white dark:bg-gray-700 rounded-xl shadow-md border border-gray-50 dark:border-gray-600 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-orange-500" />
                      </div>
                      <span className="text-[10px] font-black text-orange-500 uppercase tracking-tighter">Change</span>
                    </button>
                  </div>

                  <input
                    placeholder="Save address as *"
                    value={receiverDetails.landmark}
                    onChange={e => setReceiverDetails({ ...receiverDetails, landmark: e.target.value })}
                    className="w-full p-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:border-orange-500 shadow-sm"
                  />
                </div>
              </div>

              {/* Delivery Instructions */}
              <div className="space-y-4">
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Delivery Instructions</h3>
                <div className="relative">
                  <textarea
                    placeholder="Instructions to reach location"
                    value={receiverDetails.instructions}
                    onChange={e => setReceiverDetails({ ...receiverDetails, instructions: e.target.value })}
                    className="w-full p-4 py-6 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:border-orange-500 shadow-sm min-h-[80px]"
                  />
                  <button className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-500 font-bold">Add</button>
                </div>
              </div>

              <Button
                onClick={() => setCheckoutStage('confirm_details')}
                className="w-full py-8 rounded-2xl bg-gray-200 dark:bg-gray-800 hover:bg-orange-500 hover:text-white text-gray-400 font-black text-xl transition-all shadow-lg"
              >
                Save Address
              </Button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Confirm Details Small Popup */}
      <AnimatePresence>
        {checkoutStage === 'confirm_details' && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 50 }}
                className="bg-white dark:bg-[#1a1a1a] rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl overflow-hidden relative"
              >
                <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-8 border-b dark:border-gray-800 pb-4">Confirm Details</h2>

                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-6 w-6 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-black text-lg text-gray-900 dark:text-white leading-tight mb-2">
                        {receiverDetails.saveAs || 'Default'}
                      </p>
                      <p className="text-sm text-gray-500 leading-snug">
                        {receiverDetails.houseNo ? `${receiverDetails.houseNo}, ` : ''}
                        {receiverDetails.buildingName ? `${receiverDetails.buildingName}, ` : ''}
                        {tempAddressInfo.formattedAddress}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <UserIcon className="h-6 w-6 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {receiverDetails.useAccountDetails ? userProfile?.name : receiverDetails.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {receiverDetails.useAccountDetails ? userProfile?.phone : receiverDetails.phone}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-12">
                  <button
                    onClick={() => setCheckoutStage('address_details')}
                    className="flex-1 py-4 bg-orange-50 dark:bg-orange-900/10 text-orange-600 font-bold rounded-2xl border border-orange-100 dark:border-orange-900/20 hover:bg-orange-100 transition-colors"
                  >
                    Edit details
                  </button>
                  <button
                    onClick={() => {
                      // Create temporary selected address object
                      setSelectedAddressForOrder({
                        label: receiverDetails.saveAs,
                        street: receiverDetails.buildingName || tempAddressInfo.area,
                        additionalDetails: receiverDetails.houseNo,
                        city: tempAddressInfo.city,
                        formattedAddress: tempAddressInfo.formattedAddress,
                        location: { coordinates: [tempMapCoords.lng, tempMapCoords.lat] }
                      })
                      setIsAddressConfirmed(true)
                      setCheckoutStage('payment')
                    }}
                    className="flex-1 py-4 bg-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-200 transition-transform active:scale-95"
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Sticky - CTA Area */}
      <div className="bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 shadow-lg z-30 flex-shrink-0 fixed bottom-0 left-0 right-0">
        <div className="max-w-7xl mx-auto">
          <div className="px-4 md:px-6 py-3 md:py-4">
            <div className="w-full max-w-md md:max-w-lg mx-auto">
              {!isAddressConfirmed ? (
                /* Address Prompt Flow */
                <div className="flex flex-col items-center gap-4 py-4 md:py-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3">
                    <Navigation className="h-6 w-6 text-orange-500 fill-orange-500" />
                    <p className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                      Where would you like us to deliver this order?
                    </p>
                  </div>
                  <Button
                    onClick={() => setCheckoutStage('address_selection')}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-3xl h-14 md:h-16 text-lg md:text-xl font-black shadow-xl shadow-orange-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Add or Select address
                  </Button>
                </div>
              ) : (
                /* Swiggy-Style Payment Bottom Bar */
                <div className="flex items-center gap-3">
                  {/* Left: PAY USING - tappable to open payment options */}
                  <button
                    onClick={() => setShowPaymentOptions(true)}
                    className="flex-1 flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-0"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-[10px] font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">
                        PAY USING <ChevronUp className="h-3 w-3" />
                      </p>
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate mt-0.5">
                        {selectedPaymentMethod === "razorpay"
                          ? "Razorpay (Online)"
                          : selectedPaymentMethod === "wallet"
                            ? `Wallet (₹${walletBalance.toFixed(0)})`
                            : "Pay on Delivery (Cash/UPI)"}
                      </p>
                      {selectedPaymentMethod === "cash" && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">Pay cash or ask for QR code</p>
                      )}
                    </div>
                  </button>

                  {/* Right: Pay Button */}
                  <button
                    onClick={() => {
                      if (selectedPaymentMethod === "cash") {
                        setShowCashConfirm(true)
                      } else {
                        handlePlaceOrder()
                      }
                    }}
                    disabled={isPlacingOrder || (selectedPaymentMethod === "wallet" && walletBalance < total)}
                    className="flex-shrink-0 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-black text-base px-6 py-3.5 rounded-xl shadow-lg shadow-green-200 dark:shadow-green-900/30 transition-all active:scale-95 disabled:cursor-not-allowed"
                  >
                    {isPlacingOrder ? "..." : `Pay ₹${total.toFixed(0)}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Payment Options Sheet ===== */}
      <AnimatePresence>
        {showPaymentOptions && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentOptions(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#111] rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-[#111] px-5 pt-5 pb-4 border-b dark:border-gray-800 z-10">
                <div className="flex items-center gap-3 mb-1">
                  <button onClick={() => setShowPaymentOptions(false)} className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                    <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <h2 className="text-lg font-black text-gray-900 dark:text-white">Payment Options</h2>
                </div>
                <div className="ml-10 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>Total: <span className="font-bold text-gray-800 dark:text-gray-200">₹{total.toFixed(0)}</span></span>
                  {discount > 0 && <><span>·</span><span className="text-green-600 font-bold">Savings of ₹{discount}</span></>}
                </div>
              </div>

              <div className="p-5 space-y-6">
                {/* Pay on Delivery */}
                <div>
                  <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Pay on Delivery</p>
                  <button
                    onClick={() => { setSelectedPaymentMethod('cash'); setSelectedUpiApp(null); setShowPaymentOptions(false); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'cash' ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">💵</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-gray-900 dark:text-white text-sm">Pay on Delivery (Cash/UPI)</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pay cash or ask for QR code</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPaymentMethod === 'cash' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                      {selectedPaymentMethod === 'cash' && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                  </button>
                </div>

                {/* Wallet */}
                <div>
                  <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Wallet</p>
                  <button
                    onClick={() => { setSelectedPaymentMethod('wallet'); setSelectedUpiApp(null); setShowPaymentOptions(false); }}
                    disabled={walletBalance < total}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all disabled:opacity-50 ${selectedPaymentMethod === 'wallet' ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Wallet className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-gray-900 dark:text-white text-sm">App Wallet</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Balance: ₹{walletBalance.toFixed(0)} {walletBalance < total ? '— Insufficient balance' : ''}
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPaymentMethod === 'wallet' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                      {selectedPaymentMethod === 'wallet' && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                  </button>
                </div>

                {/* Pay by UPI App */}
                <div>
                  <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Pay by any UPI App</p>
                  <div className="space-y-2">
                    {/* Google Pay */}
                    <button
                      onClick={() => { setSelectedPaymentMethod('razorpay'); setSelectedUpiApp('google_pay'); setShowPaymentOptions(false); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'google_pay'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                        : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-white border border-gray-100 dark:border-gray-700 shadow-sm">
                        <svg viewBox="0 0 48 48" className="w-8 h-8">
                          <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
                          <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.32-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
                          <path fill="#FBBC05" d="M11.68 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.68-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.34-5.7z" />
                          <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.34 5.7c1.74-5.2 6.59-9.07 12.32-9.07z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">Google Pay</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pay via Google Pay UPI</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'google_pay' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'google_pay' && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                    </button>

                    {/* Paytm UPI */}
                    <button
                      onClick={() => { setSelectedPaymentMethod('razorpay'); setSelectedUpiApp('paytm'); setShowPaymentOptions(false); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'paytm'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                        : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-[#00BAF2] shadow-sm">
                        <span className="text-white font-black text-lg tracking-tighter">Pay</span>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">Paytm UPI</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pay via Paytm UPI ID</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'paytm' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'paytm' && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                    </button>

                    {/* PhonePe */}
                    <button
                      onClick={() => { setSelectedPaymentMethod('razorpay'); setSelectedUpiApp('phonepe'); setShowPaymentOptions(false); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'phonepe'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                        : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-[#5F259F] shadow-sm">
                        <svg viewBox="0 0 48 48" className="w-8 h-8" fill="white">
                          <path d="M24 6C14.06 6 6 14.06 6 24s8.06 18 18 18 18-8.06 18-18S33.94 6 24 6zm6.5 26.5h-4v-5.5h-5v5.5h-4v-13h4v4h5v-4h4v13z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">PhonePe</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pay via PhonePe UPI</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'phonepe' ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {selectedPaymentMethod === 'razorpay' && selectedUpiApp === 'phonepe' && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                    </button>

                    {/* Add New UPI ID */}
                    <button
                      onClick={() => { setSelectedPaymentMethod('razorpay'); setSelectedUpiApp(null); setShowPaymentOptions(false); }}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800">
                        <Plus className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-gray-700 dark:text-gray-300 text-sm">Add New UPI ID</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">You need to have a registered UPI ID</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    </button>
                  </div>
                </div>

                {/* Credit & Debit Cards */}
                <div>
                  <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Credit & Debit Cards</p>
                  <button
                    onClick={() => { setSelectedPaymentMethod('razorpay'); setShowPaymentOptions(false); }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800">
                      <Plus className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-gray-700 dark:text-gray-300 text-sm">Add New Card</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Save and Pay via Cards.</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </button>
                </div>

                {/* More Payment Options */}
                <div>
                  <p className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">More Payment Options</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Wallets', sub: 'PhonePe, Amazon Pay & more', icon: '👛' },
                      { label: 'Netbanking', sub: 'Select from a list of banks', icon: '🏦' },
                      { label: 'CRED Pay', sub: 'Pay via CRED coins or CRED cash', icon: '💳' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => { setSelectedPaymentMethod('razorpay'); setShowPaymentOptions(false); }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                      >
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">
                          {opt.icon}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-bold text-gray-900 dark:text-white text-sm">{opt.label}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.sub}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bottom Confirm */}
                <div className="pb-safe">
                  <button
                    onClick={() => {
                      setShowPaymentOptions(false)
                      if (selectedPaymentMethod === 'cash') {
                        setShowCashConfirm(true)
                      } else {
                        handlePlaceOrder()
                      }
                    }}
                    disabled={isPlacingOrder}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-green-200 dark:shadow-green-900/20 transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    Pay ₹{total.toFixed(0)}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===== Cash Order Confirmation Dialog ===== */}
      <AnimatePresence>
        {showCashConfirm && (
          <div className="fixed inset-0 z-[70] overflow-hidden flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCashConfirm(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1a1a1a] rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl mx-auto text-center"
            >
              {/* Rupee Icon */}
              <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">💵</span>
              </div>

              <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-3">Placing cash order</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
                Give cash or ask delivery partner for QR code when your order is delivered!
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCashConfirm(false)}
                  className="flex-1 py-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowCashConfirm(false)
                    handlePlaceOrder()
                  }}
                  disabled={isPlacingOrder}
                  className="flex-1 py-4 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl shadow-lg shadow-green-200 dark:shadow-green-900/30 transition-all active:scale-95 disabled:opacity-60"
                >
                  Yes! Place Order
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Placing Order Modal */}
      {showPlacingOrder && (
        <div className="fixed inset-0 z-[60] h-screen w-screen overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="px-6 py-8">
              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Placing your order</h2>

              {/* Payment Info */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-white shadow-sm">
                  <CreditCard className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedPaymentMethod === "razorpay"
                      ? `Pay ₹${total.toFixed(2)} online (Razorpay)`
                      : selectedPaymentMethod === "wallet"
                        ? `Pay ₹${total.toFixed(2)} from Wallet`
                        : `Pay on delivery (COD)`}
                  </p>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-gray-50">
                  <svg className="w-7 h-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">Delivering to Location</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Address") : "Add address"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {defaultAddress ? (formatFullAddress(defaultAddress) || "Address") : "Address"}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative mb-6">
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-100 ease-linear"
                    style={{
                      width: `${orderProgress}%`,
                      boxShadow: '0 0 10px rgba(34, 197, 94, 0.5)'
                    }}
                  />
                </div>
                {/* Animated shimmer effect */}
                <div
                  className="absolute inset-0 h-2.5 rounded-full overflow-hidden pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    animation: 'shimmer 1.5s infinite',
                    width: `${orderProgress}%`
                  }}
                />
              </div>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  setShowPlacingOrder(false)
                  setIsPlacingOrder(false)
                }}
                className="w-full text-right"
              >
                <span className="text-green-600 font-semibold text-base hover:text-green-700 transition-colors">
                  CANCEL
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Success Celebration Page */}
      {showOrderSuccess && (
        <div
          className="fixed inset-0 z-[70] bg-white flex flex-col items-center justify-center h-screen w-screen overflow-hidden"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          {/* Confetti Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Animated confetti pieces */}
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-sm"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-10%`,
                  backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][Math.floor(Math.random() * 6)],
                  animation: `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 2}s infinite`,
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            ))}
          </div>

          {/* Success Content */}
          <div className="relative z-10 flex flex-col items-center px-6">
            {/* Success Tick Circle */}
            <div
              className="relative mb-8"
              style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}
            >
              {/* Outer ring animation */}
              <div
                className="absolute inset-0 w-32 h-32 rounded-full border-4 border-green-500"
                style={{
                  animation: 'ringPulse 1.5s ease-out infinite',
                  opacity: 0.3
                }}
              />
              {/* Main circle */}
              <div className="w-32 h-32 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-2xl">
                <svg
                  className="w-16 h-16 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: 'checkDraw 0.5s ease-out 0.5s both' }}
                >
                  <path d="M5 12l5 5L19 7" className="check-path" />
                </svg>
              </div>
              {/* Sparkles */}
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                  style={{
                    top: '50%',
                    left: '50%',
                    animation: `sparkle 0.6s ease-out ${0.3 + i * 0.1}s both`,
                    transform: `rotate(${i * 60}deg) translateY(-80px)`,
                  }}
                />
              ))}
            </div>

            {/* Location Info */}
            <div
              className="text-center"
              style={{ animation: 'slideUp 0.5s ease-out 0.6s both' }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-5 h-5 text-red-500">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {defaultAddress?.city || "Your Location"}
                </h2>
              </div>
              <p className="text-gray-500 text-base">
                {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Delivery Address") : "Delivery Address"}
              </p>
            </div>

            {/* Order Placed Message */}
            <div
              className="mt-12 text-center"
              style={{ animation: 'slideUp 0.5s ease-out 0.8s both' }}
            >
              <h3 className="text-3xl font-bold text-green-600 mb-2">
                {wasHibermartOrder ? "Order Submitted!" : "Order Placed!"}
              </h3>
              <p className="text-gray-600">
                {wasHibermartOrder
                  ? "Waiting for admin approval before assigning a delivery partner"
                  : "Your delicious food is on its way"}
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={handleGoToOrders}
              className="mt-10 bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-12 rounded-xl shadow-lg transition-all hover:shadow-xl hover:scale-105"
              style={{ animation: 'slideUp 0.5s ease-out 1s both' }}
            >
              {wasHibermartOrder ? "View Order Status" : "Track Your Order"}
            </button>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeInBackdrop {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUpBannerSmooth {
          from {
            transform: translateY(100%) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes slideUpBanner {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes shimmerBanner {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes scaleInBounce {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes pulseRing {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.4);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        @keyframes checkMarkDraw {
          0% {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            stroke-dasharray: 100;
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
        @keyframes slideUpFull {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes slideUpModal {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes checkDraw {
          0% {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
          }
          100% {
            stroke-dasharray: 100;
            stroke-dashoffset: 0;
          }
        }
        @keyframes ringPulse {
          0% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.3);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        @keyframes sparkle {
          0% {
            transform: rotate(var(--rotation, 0deg)) translateY(0) scale(0);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--rotation, 0deg)) translateY(-80px) scale(1);
            opacity: 0;
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(30px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes confettiFall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-slideUpFull {
          animation: slideUpFull 0.3s ease-out;
        }
        .check-path {
          stroke-dasharray: 100;
          stroke-dashoffset: 0;
        }
      `}</style>
    </div>
  )
}

// Helper components for Leaflet
function MapEventsHandler({ setCoords, setAddressInfo }) {
  const map = useMap()

  useMapEvents({
    moveend: async () => {
      const center = map.getCenter()
      setCoords({ lat: center.lat, lng: center.lng })

      try {
        const response = await fetch(
          `${API_BASE_URL}/geocode/reverse?lat=${center.lat}&lon=${center.lng}`
        )
        const result = await response.json()
        const data = result?.data || result
        if (data && data.address) {
          const area = data.address.suburb || data.address.neighbourhood || data.address.residential || data.address.road || 'Unknown Area'
          const city = data.address.city || data.address.town || data.address.village || 'Unknown City'
          setAddressInfo({
            area,
            city,
            formattedAddress: data.display_name
          })
        }
      } catch (error) {
        console.error("Error fetching address details:", error)
      }
    }
  })

  return null
}
