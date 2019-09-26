This issue template outlines the customer outreach process to work alongside, test and roll out our reference architecture.

### Customer Background

* Salesforce Link:
* Account Management Project link:
* SA Owner:
* TAM Owner:
* Current # of users:
* Anticipated # of users (within 1 year):
* Target Destination: (On prem/GCP/AWS/etc.)

This is split up into 4 stages.

### Stage 1 - Discovery
In this stage we should aim to answer these questions:
* What are the questions we need to ask to get clarity on testing and specifications?
* If we know of certain bottlenecks, what questions should we bring to the table? Examples:
  * Can we get a replica of the database sanitised or a rough demographic of their data? This is helpful for testing against the shape of data. How big is their database?
  * What is their data retention policy?
  * What is the network topology, do we need to test and account for any latency?
  * If there is a wishlist from engineering, what is it?

We also recommend more frequent Zoom meetings to the discovery process. Leverage Customer Success/Professional Services to set the meeting up.

* [ ] Request logs from customer with the following:    
  1. `production_json.log`
  1. `api_json.log`
  1. Gitaly logs /`var/log/gitlab/gitaly/current`
  1. Sidekiq logs `/var/log/gitlab/sidekiq/current`
* [ ] Analyze customer's logs using [`fast-stats`](https://gitlab.com/gitlab-com/support/toolbox/fast-stats).
From the result of log analysis we should determine if a follow up discussion is required to answer questions on their current setup and requirements.
* [ ] **Touchpoint** From the result of log analysis we should do a follow up Zoom call to answer questions and gather information.

### Stage 2 - Test Cycle
Constant feedback loop with customers and our testing.
Let them know what tests we are running and compare notes with the customer.
Adjust testing as needed. Keep on iterating.
* [ ] **Touchpoint** Ensure to do this as frequently as needed. 

### Stage 3 - Recommendation
After going through the test cycle and validating test results are satisfactory, provide updates to the customer and assess the current setup.
* [ ] Have a roll out plan written down to transition the customer to the new architecture.
* [ ] **Touchpoint** Present the architecture plan to the customer.

### Stage 4 - Rollout and Monitoring
Roll out to the customer.
* [ ] **Touchpoint** Sync call to propose the roll out plan.
* [ ] Ensure that monitoring is setup on the customer's environment.

/confidential
