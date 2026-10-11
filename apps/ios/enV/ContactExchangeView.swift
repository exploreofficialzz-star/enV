import SwiftUI

struct ContactExchangeView: View {
    @StateObject private var controller = ContactExchangeController()
    @State private var fullName = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var company = ""
    @State private var jobTitle = ""
    @State private var website = ""
    @State private var saveError: String?

    var body: some View {
        Form {
            Section {
                Text("Both people must activate Exchange. Only the fields below are shared after the native nearby session is established.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Your contact") {
                TextField("Full name", text: $fullName)
                TextField("Phone", text: $phone).keyboardType(.phonePad)
                TextField("Email", text: $email).keyboardType(.emailAddress)
                TextField("Company", text: $company)
                TextField("Job title", text: $jobTitle)
                TextField("Website", text: $website).keyboardType(.URL)
            }
            Section {
                Button(controller.active ? "Exchange active" : "Activate Exchange") {
                    if controller.active { controller.stop() } else { controller.start(fullName: fullName, phone: phone, email: email, company: company, jobTitle: jobTitle, website: website) }
                }
                if controller.active { Text("Connected participants: \(controller.connectedCount)").foregroundStyle(.secondary) }
                if let error = controller.error { Text(error).foregroundStyle(.red) }
            }
            if !controller.received.isEmpty {
                Section("Received contacts") {
                    ForEach(controller.received) { contact in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(contact.fullName.isEmpty ? "Unnamed contact" : contact.fullName).font(.headline)
                            ForEach([contact.phone, contact.email, contact.company, contact.jobTitle, contact.website].filter { !$0.isEmpty }, id: \.self) { Text($0).font(.subheadline) }
                            Button("Save to Contacts") {
                                controller.save(contact) { result in if case .failure(let error) = result { saveError = error.localizedDescription } }
                            }
                        }
                    }
                }
            }
            if let saveError { Section { Text(saveError).foregroundStyle(.red) } }
        }
        .navigationTitle("Instant Contact Exchange")
        .onDisappear { controller.stop() }
    }
}
