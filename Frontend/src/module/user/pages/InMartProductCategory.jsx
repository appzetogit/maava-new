import { useParams } from "react-router-dom"
import { useState, useEffect, useCallback } from "react"
import ProductCategoryView from "../components/ProductCategoryView"
import { getInMartHome, getProducts } from "@/lib/api/inmartAPI"

export default function InMartProductCategory() {
    const { categorySlug } = useParams()
    const [isLoading, setIsLoading] = useState(true)
    const [subCategory, setSubCategory] = useState(null)
    const [activeChildCategory, setActiveChildCategory] = useState(null)
    const [products, setProducts] = useState([])
    const [allCategories, setAllCategories] = useState([])

    // Fetch Category Hierarchy and initial data
    const fetchInitialData = useCallback(async () => {
        try {
            setIsLoading(true)
            const homeData = await getInMartHome()
            if (homeData.success) {
                const cats = homeData.data.categories
                setAllCategories(cats)

                // Find the sub-category that matches the slug in the URL
                let foundSub = null
                for (const mainCat of cats) {
                    const sub = mainCat.subCategories.find(s => s.slug === categorySlug || s.id === categorySlug)
                    if (sub) {
                        foundSub = sub
                        break
                    }
                }

                if (foundSub) {
                    setSubCategory(foundSub)
                    // Find the parent main category for this sub
                    const parentCat = cats.find(c => c.subCategories.some(s => s.id === foundSub.id || s._id === foundSub._id || s.slug === foundSub.slug))

                    // Set active child to "All" initially
                    setActiveChildCategory({ name: 'All', id: 'all' })

                    // Fetch products for this specific sub-category within its parent
                    const productData = await getProducts({
                        category: parentCat?.name,
                        subCategory: foundSub.name
                    })
                    if (productData.success) {
                        const normalizedProducts = productData.data.products.map(p => ({
                            ...p,
                            id: p.id || p._id?.toString() || p._id
                        }))
                        setProducts(normalizedProducts)
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching category data:", error)
        } finally {
            setIsLoading(false)
        }
    }, [categorySlug])

    useEffect(() => {
        fetchInitialData()
    }, [fetchInitialData])

    // Handle child category selection in sidebar
    const handleChildCategoryChange = async (childCatName) => {
        if (!subCategory) return

        try {
            if (childCatName === 'All') {
                setActiveChildCategory({ name: 'All', id: 'all' })
                const parentCat = allCategories.find(c => c.subCategories.some(s => s._id === subCategory._id || s.slug === subCategory.slug))
                const productData = await getProducts({
                    category: parentCat?.name,
                    subCategory: subCategory.name
                })
                if (productData.success) {
                    const normalizedProducts = productData.data.products.map(p => ({
                        ...p,
                        id: p.id || p._id?.toString() || p._id
                    }))
                    setProducts(normalizedProducts)
                }
            } else {
                const childCat = subCategory.children.find(c => c.name === childCatName)
                if (childCat) {
                    setActiveChildCategory(childCat)
                    // Find the parent main category for this sub
                    const parentCat = allCategories.find(c => c.subCategories.some(s => s._id === subCategory._id || s.slug === subCategory.slug))

                    const productData = await getProducts({
                        category: parentCat?.name,
                        subCategory: subCategory.name,
                        childCategory: childCat.name
                    })
                    if (productData.success) {
                        const normalizedProducts = productData.data.products.map(p => ({
                            ...p,
                            id: p.id || p._id?.toString() || p._id
                        }))
                        setProducts(normalizedProducts)
                    }
                }
            }
        } catch (error) {
            console.error("Error filtering products:", error)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
            </div>
        )
    }

    if (!subCategory) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
                <h2 className="text-2xl font-black text-neutral-900 mb-2">Category Not Found</h2>
                <p className="text-neutral-500">The category you are looking for doesn't exist.</p>
            </div>
        )
    }

    // Sidebar items are children of the current subCategory
    // We add an "All" option at the top
    const sidebarItems = [
        { id: 'all', name: 'All', icon: subCategory.image },
        ...(subCategory.children || []).map(child => ({
            id: child.id || child.slug,
            name: child.name,
            icon: child.image || subCategory.image
        }))
    ]

    return (
        <ProductCategoryView
            title={subCategory.name}
            sidebarCategories={sidebarItems}
            products={products}
            activeCategory={activeChildCategory?.name || 'All'}
            onCategoryChange={handleChildCategoryChange}
        />
    )
}
