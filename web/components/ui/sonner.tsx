"use client"

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Toasts (docs/DESIGN_BRIEF.md §7, §13): forest background, green tick for success, red for errors;
// bottom-centre on phones, bottom-right on laptops; 4 s.
const LAPTOP = "(min-width: 1024px)"

function useIsLaptop() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(LAPTOP)
      query.addEventListener("change", onChange)
      return () => query.removeEventListener("change", onChange)
    },
    () => window.matchMedia(LAPTOP).matches,
    () => false,
  )
}

const Toaster = (props: ToasterProps) => {
  const isLaptop = useIsLaptop()

  return (
    <Sonner
      theme="light"
      position={isLaptop ? "bottom-right" : "bottom-center"}
      duration={4000}
      // On phones, sit above the user area's bottom nav (about 88 px tall).
      mobileOffset={{ bottom: 96 }}
      icons={{
        success: <CircleCheckIcon className="size-5 text-leaf" />,
        info: <InfoIcon className="size-5 text-gold" />,
        warning: <TriangleAlertIcon className="size-5 text-gold" />,
        error: <OctagonXIcon className="size-5 text-white" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-2xl !border-0 !bg-forest !text-white !shadow-toast !font-sans !text-[15px] !gap-3 !p-3.5",
          error: "!bg-danger",
          description: "!text-mint",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
