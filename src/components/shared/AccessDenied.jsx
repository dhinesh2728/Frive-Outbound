import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <ShieldX className="w-14 h-14 text-muted-foreground mb-4" />
      <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
      <p className="text-muted-foreground mb-6">You do not have permission to access this page.</p>
      <Button asChild variant="outline">
        <Link to="/counting">Go to Meal Counting</Link>
      </Button>
    </div>
  );
}
