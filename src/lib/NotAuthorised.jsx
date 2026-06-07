import { ShieldX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotAuthorised() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <ShieldX className="w-14 h-14 text-muted-foreground mb-4" />
      <h2 className="text-xl font-bold text-foreground mb-2">Not Authorised</h2>
      <p className="text-muted-foreground mb-6 max-w-xs">
        You don't have permission to access this page. Contact your administrator if you need access.
      </p>
      <Button variant="outline" onClick={() => navigate(-1)}>
        Go back
      </Button>
    </div>
  );
}
