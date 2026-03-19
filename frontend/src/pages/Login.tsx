import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Header from "@/components/Header";
import { getApiUrl } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const googleAuthUrl = getApiUrl("api/auth/google");

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const errorParam = searchParams.get("error");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const response = await fetch(getApiUrl("api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Store token if provided
        if (result.token) {
          localStorage.setItem("token", result.token);
        }
        // Store user data if provided
        if (result.user) {
          localStorage.setItem("user", JSON.stringify(result.user));
        }
        navigate("/dashboard");
      } else {
        alert(result.message || "Login failed. Please check your credentials.");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("An error occurred. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-lg border-2">
          <CardHeader className="space-y-3 pb-6">
            <div className="flex flex-col space-y-2 text-center">
              <CardTitle className="text-3xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription className="text-base">
                Enter your credentials to access your account
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  {...register("email")}
                  className={`h-11 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {errors.email && (
                  <p className="text-sm text-destructive font-medium">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...register("password")}
                  className={`h-11 ${errors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {errors.password && (
                  <p className="text-sm text-destructive font-medium">{errors.password.message}</p>
                )}
              </div>
              {errorParam === "oauth_failed" && (
                <p className="text-sm text-destructive font-medium">
                  Google sign-in failed. Please try again.
                </p>
              )}
              {errorParam === "missing_code" && (
                <p className="text-sm text-destructive font-medium">
                  Sign-in was cancelled or encountered an error.
                </p>
              )}
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Logging in..." : "Log in"}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full h-11"
                onClick={() => (window.location.href = googleAuthUrl)}
                disabled={isSubmitting}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </Button>
            </form>
          </CardContent>
          <CardFooter className="pt-6">
            <div className="text-sm text-center text-muted-foreground w-full">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:text-primary/80 font-semibold underline-offset-4 hover:underline transition-colors">
                Sign up
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
