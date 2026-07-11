type AdminErrorDetailsProps = {
  title: string
  explanation: string
  action: string
  technical?: {
    httpStatus?: number
    endpoint?: string
    errorCode?: string
    requestId?: string
    rawMessage?: string
    timestamp?: string
  }
}

/**
 * Presentational helper for operator errors.
 * Kept as a pure data → structure mapper so Package A does not depend on
 * React Admin runtime until widgets are bootstrapped.
 */
export function buildAdminErrorViewModel(props: AdminErrorDetailsProps) {
  return {
    primary: {
      title: props.title,
      explanation: props.explanation,
      action: props.action,
    },
    technicalRows: [
      props.technical?.httpStatus != null
        ? { label: "HTTP", value: String(props.technical.httpStatus) }
        : null,
      props.technical?.endpoint
        ? { label: "Endpoint", value: props.technical.endpoint }
        : null,
      props.technical?.errorCode
        ? { label: "Code", value: props.technical.errorCode }
        : null,
      props.technical?.requestId
        ? { label: "Request ID", value: props.technical.requestId }
        : null,
      props.technical?.rawMessage
        ? { label: "Raw", value: props.technical.rawMessage }
        : null,
      props.technical?.timestamp
        ? { label: "Time", value: props.technical.timestamp }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>,
  }
}
