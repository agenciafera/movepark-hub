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

### RF003 - On the homepage we must show our features
- We must show our features
- Each feature should have a title, a description and an icon
- All images that we will use must use the placeholder online service
- The page must have a list on the left and a image on the right side

### RF004 - On the homepage we must show our KPIs
- The page must have a title and a description
- The KPIs must be shown in a horizontal list

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
│   ├── favicon.ico
│   ├── fonts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── bun.lockb
├── components.json
├── instructions
│   └── draft.md
├── lib
│   └── utils.ts
├── next-env.d.ts
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── public
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── tailwind.config.ts
└── tsconfig.json

## Additional requirements

1. Project setup

- All new components should go in /components at the root (not in the app folder) and be named Like example-component.ts unless otherwise specified
- All new pages go in /app
- Use the Next. is 15 app router
- All data fetching should be done in a server component and pass the data down as props
- Client components (useState, hooks, etc) require that 'use client' is set at the top of the file

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

6. API Client Initialization:

- Initialize API clients (e.g., Snoowrap for Reddit, OpenAI) in server-side code only.
- Implement checks to ensure API clients are properly initialized before use.