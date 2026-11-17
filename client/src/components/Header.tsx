import { Link, useLocation } from "wouter";
import { ShoppingCart, User, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Header() {
  const [location, navigate] = useLocation();
  const { items } = useCart();
  const { user } = useAuth();
  const cartCount = items.reduce((s, it) => s + (it.quantity || 1), 0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Services", path: "/services" },
    { label: "Products", path: "/products" },
    { label: "Book Now", path: "/booking" },
    { label: "About", path: "/about" },
    ...(user?.isAdmin ? [{ label: "Admin", path: "/admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 md:h-20 items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/">
              <a className="flex items-center space-x-2" data-testid="link-home">
                <span className="font-serif text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
                  GlowGrace
                </span>
              </a>
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <Link key={item.path} href={item.path}>
                  <a
                    className={`text-base font-medium transition-colors hover:text-primary ${
                      location === item.path
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                    data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                  >
                    {item.label}
                  </a>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1 md:gap-3 [&_button_svg]:size-5">
            <Button variant="ghost" size="icon" data-testid="button-search" onClick={() => navigate('/products')}>
              <Search className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon" className="relative" data-testid="button-cart" onClick={() => navigate('/cart')}>
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] flex items-center justify-center px-1 text-xs" data-testid="text-cart-count">
                  {cartCount}
                </Badge>
              )}
            </Button>

            <Button 
              variant="ghost" 
              size="icon" 
              data-testid="button-user" 
              onClick={() => navigate('/account')}
              className="relative rounded-full hover:bg-muted/60 transition-transform active:scale-90"
              title={user ? `Signed in as ${user.displayName || user.email}` : "Sign In"}
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="w-7 h-7 rounded-full object-cover border border-primary/40 shadow-xs"
                />
              ) : user ? (
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shadow-xs">
                  {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                </div>
              ) : (
                <User className="h-5 w-5" />
              )}
              {user && (
                <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-500 border border-background" />
              )}
            </Button>

            <ThemeToggle />

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-mobile-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <nav className="flex flex-col gap-4 mt-8">
                  {navItems.map((item) => (
                    <Link key={item.path} href={item.path}>
                      <a
                        className={`text-lg font-medium transition-colors hover:text-primary ${
                          location === item.path
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => setMobileMenuOpen(false)}
                        data-testid={`link-mobile-${item.label.toLowerCase().replace(' ', '-')}`}
                      >
                        {item.label}
                      </a>
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
