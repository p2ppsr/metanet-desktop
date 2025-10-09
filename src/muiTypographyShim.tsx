// src/muiTypographyShim.tsx
import React from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'

const shimTheme = createTheme({
  components: {
    // Force Typography to be inline for body/subtitle etc.
    MuiTypography: {
      defaultProps: {
        component: 'span',
        paragraph: false,
        variantMapping: {
          body1: 'span',
          body2: 'span',
          subtitle1: 'span',
          subtitle2: 'span',
          overline: 'span',
          caption: 'span',
          button: 'span',
          inherit: 'span',
          // keep headings as block elements
          h1: 'h1',
          h2: 'h2',
          h3: 'h3',
          h4: 'h4',
          h5: 'h5',
          h6: 'h6',
        },
      },
    },

    // ListItemText's d.ts narrows Typography's 'component' to "p".
    // We override it to 'span' and cast to any to satisfy TS while
    // keeping the runtime behavior we want.
    MuiListItemText: {
      defaultProps: {
        primaryTypographyProps: { component: 'span', paragraph: false } as any,
        secondaryTypographyProps: { component: 'span', paragraph: false } as any,
      },
    },
  },
})

type Props = { children: React.ReactNode }

export default function MuiTypographyShim({ children }: Props) {
  return <ThemeProvider theme={shimTheme}>{children}</ThemeProvider>
}
