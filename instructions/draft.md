## Project overview

You are building a reservation system that is a centralized hub where users can search registered parking locations by location, arrival date and time, and departure date and time, providing a comprehensive list of available options.

You will use NextJS 15, shadcn, tailwind, Lucid icon

## Core functionalities

### RF001 - Fetch parks using a intuitive search bar

- Users can use the search bar by location, arrival date(including time), departure date(including time)
- Users can clicking on and search button, witch should send the search with queries params to a result page
- When the user clicks on the search button, the search should be redirected to the result page(RF002)

### RF002 - List all results by list and map

- The project should have a list and a map on the result page
- On the top of the page, there should be the search bar(RF001)
- The result page must be splitted in two columns, the left column is the list and the right column is the map
- Users can see the results of search by list and map
- Users can view the information from each park like name, address, price, rating(by stars)
- The map is based on MapBox component
- When the user clicks on a park from the list, the map should show the location of the park
- When the user clicks on a park from the list, the single page view(RF005) should be displayed

### RF003 - On the homepage we must show our features

- We must show our features
- Each feature should have a title, a description and an icon
- All images that we will use must use the placeholder online service
- The page must have a list on the left and a image on the right side

### RF004 - On the homepage we must show our KPIs

- The page must have a title and a description
- The KPIs must be shown in a horizontal list

### RF005 - Display Parking Lot Details on Single Page

- The users will reach the single page by clicking on a parking lot on the result page(RF002)
- The project must have a detailed single page view for each parking lot, providing comprehensive information about the selected location.
- At the top of the page, display the parking lot name, address, rating (with stars), and a visual indicator of the distance to nearby landmarks (in minutes).
- Image Carousel: Include a carousel or slideshow feature to display multiple images of the parking lot. The images should be high-quality and give the user a clear sense of the parking area and amenities.
- Reservation Summary: Display a reservation summary card on the right side of the page, containing:
  - Selected pass type (e.g., “Unlimited pass”)
  - Total price of the reservation
  - Arrival and departure dates and times
  - Vehicle details such as maximum height and type
  - The “Continue” button for proceeding to the next step in the booking process
- Features Section: Show specific parking features as icons with labels, such as:
  - “Contactless access” for automated entry
  - “Free cancellation” with cancellation conditions displayed (e.g., “Cancellation/modification is possible until 23:59 the day before the arrival date”)
  - Operating Hours: Include an area for operating hours, stating “Open 24 hours a day” or any specific hours for that parking lot.
  - Details Section: Provide a detailed description of the parking lot, its surroundings, and nearby attractions. This section should give users information on convenience, landmarks, and proximity to popular destinations.
  - Make this section expandable/collapsible to manage longer texts and improve readability.
- Available Features and Services: Clearly list the parking lot’s main features:
  - Type of parking (e.g., covered)
  - Maximum vehicle height
  - Security details (e.g., “Guarded,” “24h service”)
  - Directions Section: Show a map or mini-map view of the parking lot location with a “View map” button. Include specific instructions for finding the parking lot upon arrival (e.g., “When you arrive, head to the machine at the entrance”).
- Product Options: Include a section to display available product options such as:
  - “Basic pass” with entry/exit restrictions
  - “Unlimited pass” for unrestricted entry/exit
  - “Multiparking pass” for multi-location access
  - Each product should have a short description, price, and a “View prices” button where applicable.
- User Reviews Section: Display a list of user reviews, including:
  - Star rating for categories like access, facilities, and staff
  - Reviewer name, date of review, and review comment
  - Pagination to manage a large number of reviews, with clear indicators for navigating pages
- Nearby Locations Section: At the bottom of the page, include:
  - Top-rated car parks in the same city, with names and clickable links
  - A list of interesting places or events near the parking lot, with names and clickable links for each destination (e.g., “Park near Notre-Dame Cathedral in Paris | Parclick”).
  - Include a section displaying the most-booked car parks in other cities (e.g., “Parking in Barcelona,” “Parking in Milan”).
  - Responsive Design: Ensure that the layout adapts well to mobile devices and tablets. Essential elements, such as the reservation summary and images, should be easily accessible on smaller screens.

### RNF001 - The project must have color palette

- The project must have a color palette
- The colors must be defined in the tailwind.config.ts file
- The main colors of project are:
  {
  "ROSINHA": "#DA455E",
  "AZUL_ESCURO": "#29263F",
  "ROXO_MOVE": "#5D5FEF"
  }

## Docs

### Bun

Bun is an all-in-one toolkit for JavaScript and TypeScript apps. It ships as a single executable called `bun`.

### Shadcn

For add a new project with shadcn use `bunx shadcn@latest init`
For add new components with bun aways use `bunx shadcn@latest`  
For init Shadcn configuration aways use `bun x --bun shadcn@latest init`

### Placeholder

For images that we will use, we will use the placeholder online service https://placehold.co

## Current File Structure

├── README.md
├── app
│ ├── favicon.ico
│ ├── fonts
│ ├── globals.css
│ ├── layout.tsx
│ └── page.tsx
├── bun.lockb
├── components.json
├── instructions
│ └── draft.md
├── lib
│ └── utils.ts
├── next-env.d.ts
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── public
│ ├── file.svg
│ ├── globe.svg
│ ├── next.svg
│ ├── vercel.svg
│ └── window.svg
├── tailwind.config.ts
└── tsconfig.json

## Additional requirements

1. Project setup

- All new components should go in /components at the root (not in the app folder) and be named Like example-component.ts unless otherwise specified
- All new pages go in /app
- Use the Next. is 15 app router
- All data fetching should be done in a server component and pass the data down as props
- Client components (useState, hooks, etc) require that 'use client' is set at the top of the file
- Server pages with dynamic segment must get the params like this exeample:
  export default async function Page({
  params,
  }: {
  params: Promise<{ slug: string }>
  }) {
  const slug = (await params).slug
  return <div>My Post: {slug}</div>
  }

2. Server-side API Calls:

- All interactions with external APIs should be performed server-side.
- Create dedicated API routes in the `pages/api` directory for each external API interaction.
- Client-side components should fetch data through these API routes, not directly from external APIs.

3. Environment Variables:

- Store all sensitive information (API keys, credentials) in environment variables.
- Use a `env.local` file for local development and ensure it's listed in `gitignore`.
- For production, set environment variables in the deployment platform (e.g., Vercel).
- Access environment variables only in server-side code or API routes.

4. Error Handling and Logging:

- Implement comprehensive error handling in both client-side components and server-side API routes.
- Log errors on the server-side for debugging purposes.
- Display user-friendly error messages on the client-side.

5. Type Safety:

- Use TypeScript interfaces for all data structures, especially API responses.
- Avoid using any type; instead, define proper types for all variables and function parameters.
- Use the @rocketseat/eslint-config configuration for ESLint.

6. API Client Initialization:

- Initialize API clients (e.g., Snoowrap for Reddit, OpenAI) in server-side code only.
- Implement checks to ensure API clients are properly initialized before use.
