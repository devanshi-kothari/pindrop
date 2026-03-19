import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    const user = searchParams.get("user");
    const error = searchParams.get("error");

    if (error) {
      navigate(`/login?error=${error}`);
      return;
    }
    if (token) {
      localStorage.setItem("token", token);
      if (user) {
        try {
          localStorage.setItem("user", decodeURIComponent(user));
        } catch {
          // ignore parse errors
        }
      }
    }
    navigate("/dashboard");
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  );
};

export default AuthCallback;
