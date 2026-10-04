import * as React from "react";
export const useNavigate = () => (o: any) => { (window as any).__navigated = o; };
export const Link = (p: any) => React.createElement("a", { href: p.to }, p.children);
