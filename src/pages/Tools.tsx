import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

const tools = [
  {
    name: "Instantly.ai",
    url: "https://instantly.ai",
    category: "Sales",
    description: "Cold email outreach platform",
    color: "from-blue-500 to-blue-600",
  },
  {
    name: "Canva",
    url: "https://canva.com",
    category: "Design",
    description: "Graphic design tool",
    color: "from-purple-500 to-pink-500",
  },
  {
    name: "Figma",
    url: "https://figma.com",
    category: "Design",
    description: "Interface design tool",
    color: "from-purple-600 to-purple-700",
  },
  {
    name: "Notion",
    url: "https://notion.so",
    category: "Productivity",
    description: "All-in-one workspace",
    color: "from-gray-700 to-gray-800",
  },
  {
    name: "GitHub",
    url: "https://github.com",
    category: "Development",
    description: "Code repository hosting",
    color: "from-gray-800 to-gray-900",
  },
  {
    name: "AWS Console",
    url: "https://aws.amazon.com/console",
    category: "Infrastructure",
    description: "Cloud computing services",
    color: "from-orange-500 to-orange-600",
  },
  {
    name: "Stripe",
    url: "https://dashboard.stripe.com",
    category: "Payments",
    description: "Payment processing",
    color: "from-indigo-600 to-purple-600",
  },
  {
    name: "Google Analytics",
    url: "https://analytics.google.com",
    category: "Analytics",
    description: "Website analytics",
    color: "from-yellow-500 to-orange-500",
  },
  {
    name: "Namecheap",
    url: "https://namecheap.com",
    category: "Domains",
    description: "Domain registration",
    color: "from-orange-600 to-red-600",
  },
  {
    name: "ClickUp",
    url: "https://clickup.com",
    category: "Project Management",
    description: "Task management platform",
    color: "from-pink-500 to-purple-600",
  },
  {
    name: "Slack",
    url: "https://slack.com",
    category: "Communication",
    description: "Team messaging",
    color: "from-purple-600 to-purple-700",
  },
  {
    name: "Loom",
    url: "https://loom.com",
    category: "Communication",
    description: "Video messaging",
    color: "from-purple-500 to-purple-600",
  },
];

export default function Tools() {
  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="absolute top-24 right-12 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-32 left-12 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      <div className="app-light-frame relative space-y-8">
        <div className="animate-fade-in-up">
          <h1 className="app-light-title">Tools</h1>
          <p className="app-light-subtitle">Quick access to all your essential business tools</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {tools.map((tool, index) => (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group animate-fade-in-up"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <Card className="liquid-cyan-hover p-6 h-full bg-card/80 backdrop-blur-sm hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer border-border">
                <div className="space-y-4">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <span className="text-2xl font-bold text-white">
                      {tool.name.charAt(0)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {tool.name}
                      </h3>
                      <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">{tool.category}</p>
                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
