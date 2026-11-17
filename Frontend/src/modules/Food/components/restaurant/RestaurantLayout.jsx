import DesktopSidebar from "./DesktopSidebar"

export default function RestaurantLayout({ children }) {
  return (
    <div className="flex h-screen bg-white md:bg-gray-50 overflow-hidden">
      <DesktopSidebar />
      {/* <main> keeps the fixed frame; the card inside it is what scrolls on
          desktop. Both used to hide overflow, which clipped any page taller
          than the window with no way to reach the bottom of it. */}
      <main className="flex-1 min-w-0 md:ml-64 relative h-screen overflow-y-auto md:overflow-hidden flex flex-col custom-scrollbar">
        <div className="w-full flex-1 flex flex-col md:rounded-tl-2xl md:shadow-sm md:border-l md:border-t md:border-gray-200 bg-white md:bg-transparent min-h-full md:h-full md:min-h-0 md:overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  )
}
