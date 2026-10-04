import { defineHandler } from "nitro/h3";
import { backendConfig, joinUrl } from "../../../../backend/config";
import { optionsResponse, proxyRequest, unavailable } from "../../../../backend/http";
export default defineHandler(async e=>{if(e.req.method==="OPTIONS")return optionsResponse();const url=backendConfig().websiteScreenshot;if(!url)return unavailable("The website screenshot processor","WEBSITE_SCREENSHOT_API_URL");return proxyRequest(e.req,joinUrl(url,"screenshot"))})
