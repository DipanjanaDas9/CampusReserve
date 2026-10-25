
# CampusReserve – AI-Powered Campus Space & Facility Reservation Manager

CampusReserve is a web-based campus facility reservation system designed to simplify how students find, request, and manage university spaces. Students can browse rooms based on capacity, equipment, location, and availability, while facility administrators can manage spaces, review reservation requests, and monitor facility usage.

The application combines a **React frontend**, a **FastAPI backend**, and a **SQLite database**. It also includes an **AI Smart Space Finder**, which uses **Google Gemini** to interpret natural-language room requests and convert them into structured search criteria.

## Key Features

### For Students
- Register and log in securely.
- Browse and filter campus spaces by capacity, equipment, date, and time.
- View facility details and availability.
- Request reservations and view reservation history.
- Cancel eligible reservations.
- Access check-in and notification interfaces.

### For Administrators
- Manage facilities and their details.
- Review and approve or deny reservation requests.
- Access administrative dashboards and management interfaces.

### AI Smart Space Finder

Students can describe what they need in everyday language, for example:

> Find a room for 5 people tomorrow from 2 PM to 4 PM with a projector.

Google Gemini extracts relevant details such as group size, date, time, and equipment. The backend then checks room data and availability to return matching spaces.

**The AI interprets the request; the backend makes the availability decisions.**

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, JavaScript, Vite, HTML, CSS |
| Backend | Python, FastAPI, Pydantic |
| Database | SQLite |
| AI | Google Gemini API |
| Authentication | JWT and role-based access control |
| Version Control | Git and GitHub |
| Project Management | Agile Scrum, monday.com |

## Project Goal

To provide a centralized, accessible, and intelligent platform that reduces booking conflicts, simplifies room discovery, and helps universities manage campus spaces more efficiently.

