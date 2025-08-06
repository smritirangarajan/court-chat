import "./global.css"

export const metadata = {
    title: "Court Chat",
    description: "The place to go for all questions related to Supreme Court Cases"
}

const rootLayout = ({children}) => {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default rootLayout