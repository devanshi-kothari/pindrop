import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
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

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

const Signup = () => {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormValues) => {
    try {
      // TODO: Replace with actual API call
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });

      if (response.ok) {
        navigate("/login");
      } else {
        const error = await response.json();
        alert(error.message || "Signup failed. Please try again.");
      }
    } catch (error) {
      console.error("Signup error:", error);
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
              <CardTitle className="text-3xl font-bold tracking-tight">Create an account</CardTitle>
              <CardDescription className="text-base">
                Enter your information to get started with PinDrop
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  {...register("name")}
                  className={`h-11 ${errors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {errors.name && (
                  <p className="text-sm text-destructive font-medium">{errors.name.message}</p>
                )}
              </div>
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
              <div className="space-y-2.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  {...register("confirmPassword")}
                  className={`h-11 ${errors.confirmPassword ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive font-medium">{errors.confirmPassword.message}</p>
                )}
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold shadow-md hover:shadow-lg transition-all duration-200" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="pt-6">
            <div className="text-sm text-center text-muted-foreground w-full">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:text-primary/80 font-semibold underline-offset-4 hover:underline transition-colors">
                Log in
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Signup;

