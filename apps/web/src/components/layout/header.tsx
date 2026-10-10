"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Bell, Menu, Settings, LogOut, User, HelpCircle, ChevronDown } from "lucide-react";
import { SearchDialog } from "@/components/crm/search-dialog";
import { useAuth } from "@/contexts/auth-context";
import { homepageApi } from "@/lib/api";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { user, profile, logout, isAdmin, isSuperAdmin } = useAuth();
  const searchParams = useSearchParams();
  const isAuthenticated = Boolean(user);
  const showHomeSelector = isAuthenticated && isAdmin && !isSuperAdmin;
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [adminHomeOpen, setAdminHomeOpen] = React.useState(false);
  const [adminHomepages, setAdminHomepages] = React.useState<{ id: string; name: string }[]>([]);
  const homepageRefreshId = React.useRef(0);
  const [notifications] = React.useState([
    { id: 1, title: "New lead assigned", time: "5 min ago", read: false },
    { id: 2, title: "Site visit scheduled", time: "1 hour ago", read: false },
    { id: 3, title: "Payment received", time: "2 hours ago", read: true },
  ]);

  const refreshAdminDropdownData = React.useCallback(() => {
    if (!user || !isAdmin || isSuperAdmin) {
      homepageRefreshId.current += 1;
      setAdminHomepages([]);
      return;
    }

    const refreshId = ++homepageRefreshId.current;
    homepageApi.list()
      .then((homepagesResponse) => {
        const homepageItems = (Array.isArray(homepagesResponse.data)
          ? homepagesResponse.data
          : (homepagesResponse.data as any)?.data ?? (homepagesResponse.data as any)?.homepages ?? []) as Array<{ id?: string; name?: string; isActive?: boolean }>;

        const uniqueHomepages: Array<{ id: string; name: string }> = Array.from(
          new Map(
            homepageItems
              .filter((item) => !!item?.id && !!item?.name && item.isActive !== false)
              .map((item) => [item.id as string, { id: item.id as string, name: item.name as string }])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));

        if (refreshId === homepageRefreshId.current) {
          setAdminHomepages(uniqueHomepages);
        }
      })
      .catch((error) => {
        console.error("Failed to load admin homepages:", error);
        if (refreshId === homepageRefreshId.current) {
          setAdminHomepages([]);
        }
      });
  }, [isAdmin, isAuthenticated, isSuperAdmin]);

  React.useEffect(() => {
    refreshAdminDropdownData();
  }, [refreshAdminDropdownData]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  const userName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User"
    : "User";

  const handleLogout = async () => {
    await logout();
  };

  const selectedHomepageId = searchParams.get("homepage");
  const selectedHomepage = adminHomepages.find((homepage) => homepage.id === selectedHomepageId);

  const handleHomepageNavigation = (homepage: { id: string }) => {
    setAdminHomeOpen(false);
    router.push(`/dashboard?homepage=${encodeURIComponent(homepage.id)}`);
  };

  const handleDefaultHomepageNavigation = () => {
    setAdminHomeOpen(false);
    router.push("/dashboard");
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-muted-foreground md:w-80"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search leads, opportunities, tasks...</span>
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {showHomeSelector && (
            <DropdownMenu
              modal={false}
              open={adminHomeOpen}
              onOpenChange={(isOpen) => {
                setAdminHomeOpen(isOpen);
                if (isOpen) {
                  refreshAdminDropdownData();
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm"
                >
                  <span className="max-w-48 truncate">{selectedHomepage?.name || "Admin Home"}</span>
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={handleDefaultHomepageNavigation} className="text-sm">
                  Admin Home
                </DropdownMenuItem>
                {adminHomepages.map((homepage) => (
                  <DropdownMenuItem
                    key={`homepage-${homepage.id}`}
                    onSelect={() => handleHomepageNavigation(homepage)}
                    className="text-sm"
                  >
                    {homepage.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] leading-none"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-0.5">
                  <span className={cn("text-[13px]", !notification.read && "font-medium")}>
                    {notification.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{notification.time}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open("https://dctcrm.com/help", "_blank")}>
                Help Center
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("https://dctcrm.com/docs", "_blank")}>
                Documentation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("mailto:support@dctcrm.com")}>
                Contact Support
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar || ""} alt={userName} />
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-[13px] font-medium">{userName}</p>
                  <p className="text-[11px] text-muted-foreground">{user?.email || ""}</p>
                  {profile && (
                    <Badge variant="secondary" className="mt-1 w-fit">
                      {profile.name}
                    </Badge>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isSuperAdmin && (
                <>
                  <DropdownMenuItem onClick={() => router.push("/admin/users")}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/admin")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {!isSuperAdmin && isAdmin && (
                <>
                  <DropdownMenuItem onClick={() => router.push("/setup/general/users")}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/setup")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}