import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";

interface TeamMember {
  name: string;
  role: string;
  description: string;
  image?: string;
  initials: string;
}

const teamMembers: TeamMember[] = [
  {
    name: "Mallika Kulkarni",
    role: "Founder & CEO",
    description: "Passionate about making travel planning seamless and enjoyable. Loves exploring new destinations and creating memorable experiences.",
    initials: "MK",
  },
  {
    name: "Team Member 2",
    role: "Lead Developer",
    description: "Full-stack developer with a passion for building intuitive user experiences. Enjoys solving complex problems and creating elegant solutions.",
    initials: "TM",
  },
  {
    name: "Team Member 3",
    role: "Product Designer",
    description: "Creative designer focused on user-centered design. Believes in creating beautiful and functional interfaces that users love.",
    initials: "TD",
  },
  {
    name: "Team Member 4",
    role: "Travel Specialist",
    description: "Travel enthusiast with years of experience in curating amazing trips. Expert in finding hidden gems and creating unique travel experiences.",
    initials: "TS",
  },
];

const Team = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Our Team
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Meet the passionate team behind Pindrop, dedicated to making your travel planning experience exceptional.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {teamMembers.map((member, index) => (
              <Card
                key={index}
                className="shadow-lg border-2 hover:shadow-xl transition-shadow duration-300"
              >
                <CardContent className="pt-6 pb-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <Avatar className="w-24 h-24 mb-2 border-4 border-primary/20">
                      {member.image ? (
                        <AvatarImage src={member.image} alt={member.name} />
                      ) : null}
                      <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                        {member.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold tracking-tight">
                        {member.name}
                      </h3>
                      <p className="text-sm font-medium text-primary">
                        {member.role}
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed pt-2">
                        {member.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-muted-foreground mb-4">
              Want to join our team?
            </p>
            <a
              href="/contact"
              className="text-primary hover:underline font-medium"
            >
              Get in touch with us →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Team;

